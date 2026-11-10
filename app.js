import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, OAuthProvider, signInWithPopup, onAuthStateChanged, signOut }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, collection, query, where, onSnapshot, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig, TENANT_ID } from "./firebase-config.js";

const auth = getAuth(initializeApp(firebaseConfig));
const db = getFirestore();
const $ = (id) => document.getElementById(id);
let cancelarLista = null;

const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const emailDe = (u) => (u.email || u.providerData.find((p) => p.email)?.email || "").toLowerCase();

function aviso(el, texto, tipo = "info") {
  el.textContent = texto;
  el.dataset.type = tipo;
  el.hidden = !texto;
}

function mostrar(autenticado, email = "") {
  $("login").hidden = autenticado;
  $("app").hidden = !autenticado;
  $("sessao").hidden = !autenticado;
  $("user-email").textContent = email;
}

// 1) Login com Microsoft
const ERROS = {
  "auth/popup-blocked": "O browser bloqueou a janela de login. Permite popups para este site e tenta outra vez.",
  "auth/popup-closed-by-user": "Fechaste a janela de login antes de terminar.",
  "auth/cancelled-popup-request": "Já existe uma janela de login aberta. Fecha-a e tenta outra vez.",
  "auth/unauthorized-domain": "O domínio " + location.hostname + " não está autorizado. Adiciona-o em Firebase → Authentication → Settings → Authorized domains.",
  "auth/operation-not-allowed": "O provider Microsoft não está ativado em Firebase → Authentication → Sign-in method.",
  "auth/invalid-api-key": "A apiKey em js/firebase-config.js está errada ou por preencher.",
  "auth/api-key-not-valid": "A apiKey em js/firebase-config.js está errada ou por preencher.",
  "auth/internal-error": "Erro de configuração Microsoft/Azure (Client ID, Client Secret ou URI de redirecionamento). Vê a janela do login e a consola (F12).",
  "auth/invalid-credential": "A Microsoft recusou o pedido. Confirma Client ID, Client Secret (usa o Value, não o Secret ID) e o tenant.",
  "auth/account-exists-with-different-credential": "Este email já está associado a outro método de login no Firebase."
};

if (location.protocol === "file:") {
  aviso($("login-msg"), "Abriste o ficheiro diretamente. Publica no GitHub Pages ou usa um servidor local (por exemplo, Live Server no VS Code).", "error");
}

$("btn-login").addEventListener("click", async (ev) => {
  aviso($("login-msg"), "");
  const botao = ev.currentTarget;
  const provider = new OAuthProvider("microsoft.com");
  provider.addScope("openid");
  provider.addScope("email");
  provider.addScope("profile");
  provider.setCustomParameters({ prompt: "select_account", ...(TENANT_ID && { tenant: TENANT_ID }) });
  botao.disabled = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error("Erro de login:", e.code, e.message);
    aviso($("login-msg"), (ERROS[e.code] || "Não foi possível iniciar sessão.") + " [" + e.code + "]", "error");
  } finally {
    botao.disabled = false;
  }
});
$("btn-logout").addEventListener("click", () => signOut(auth));
window.appCarregou = true; // sinal para o diagnóstico do index.html

// 2) Estado de autenticação + verificação da whitelist (authorizedUsers)
onAuthStateChanged(auth, async (user) => {
  if (cancelarLista) { cancelarLista(); cancelarLista = null; }
  if (!user) return mostrar(false);

  const email = emailDe(user);
  try {
    const snap = await getDoc(doc(db, "authorizedUsers", email));
    if (!snap.exists() || snap.data().active !== true) {
      await signOut(auth);
      aviso($("login-msg"), "A conta " + email + " não está autorizada. Fala com a professora.", "error");
      return;
    }
  } catch (e) {
    console.error(e);
    await signOut(auth);
    aviso($("login-msg"), "Não foi possível validar o teu acesso. Tenta mais tarde.", "error");
    return;
  }

  mostrar(true, email);
  $("requisitante").value = user.displayName || "";
  $("devolucao").min = hoje();
  escutarPedidos(user);
});

// 3) Criar requisição
$("form-req").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const user = auth.currentUser;
  const msg = $("form-msg");
  const devolucao = $("devolucao").value;
  if (devolucao < hoje()) return aviso(msg, "A data de devolução não pode ser anterior a hoje.", "error");

  const botao = ev.submitter;
  botao.disabled = true;
  try {
    const dia = hoje();
    await addDoc(collection(db, "requisicoes"), {
      uid: user.uid,
      email: emailDe(user),
      requisitante: $("requisitante").value.trim(),
      codigo: "REQ-" + dia.replaceAll("-", "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase(),
      equipamento: $("equipamento").value,
      dataPedido: dia,
      devolucaoPrevista: devolucao,
      estado: "Pendente",
      observacoes: $("observacoes").value.trim(),
      criadoEm: serverTimestamp()
    });
    ev.target.reset();
    $("requisitante").value = user.displayName || "";
    aviso(msg, "Pedido enviado. Fica com o estado Pendente até a professora o analisar.", "ok");
  } catch (e) {
    console.error(e);
    aviso(msg, "Não foi possível enviar o pedido (" + e.code + ").", "error");
  } finally {
    botao.disabled = false;
  }
});

// 4) Listar os pedidos do utilizador (a query filtra por uid, como exigem as regras)
function escutarPedidos(user) {
  const q = query(collection(db, "requisicoes"), where("uid", "==", user.uid));
  cancelarLista = onSnapshot(q, (snap) => {
    const docs = snap.docs.map((d) => d.data())
      .sort((a, b) => (b.criadoEm?.toMillis?.() ?? Infinity) - (a.criadoEm?.toMillis?.() ?? Infinity));
    const ul = $("lista");
    ul.replaceChildren();
    $("vazio").hidden = docs.length > 0;
    for (const r of docs) {
      const li = document.createElement("li");
      li.className = r.estado.toLowerCase();
      const topo = document.createElement("div");
      topo.className = "linha1";
      const nome = document.createElement("span");
      nome.textContent = r.equipamento;
      const estado = document.createElement("span");
      estado.className = "estado";
      estado.textContent = r.estado;
      topo.append(nome, estado);
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = r.codigo + " · pedido em " + r.dataPedido + " · devolver até " + r.devolucaoPrevista
        + (r.observacoes ? " · " + r.observacoes : "");
      li.append(topo, meta);
      ul.append(li);
    }
  }, (e) => {
    console.error(e);
    aviso($("form-msg"), "Não foi possível ler os pedidos (" + e.code + ").", "error");
  });
}
