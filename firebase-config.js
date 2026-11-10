// Estes valores NÃO são segredos: identificam o projeto (Firebase Console →
// Definições do projeto → As tuas apps → App Web → Configuração do SDK).
export const firebaseConfig = {
  apiKey: "COLA_AQUI",
  authDomain: "O-TEU-PROJETO.firebaseapp.com",
  projectId: "O-TEU-PROJETO",
  storageBucket: "O-TEU-PROJETO.appspot.com",
  messagingSenderId: "COLA_AQUI",
  appId: "COLA_AQUI"
};

// ID do diretório (tenant) da escola no Azure/Entra. Deixa "" para aceitar qualquer conta Microsoft;
// com o ID preenchido, o login fica limitado à organização.
export const TENANT_ID = "";
