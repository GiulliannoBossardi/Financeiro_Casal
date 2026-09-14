/* ════════════════════════════════════════════
   CONFIGURAÇÃO DO FIREBASE
   
   1. Acesse: https://console.firebase.google.com
   2. Crie um projeto (ou use um existente)
   3. Clique em "Adicionar app" → Web (</>)
   4. Copie os valores do objeto firebaseConfig e cole abaixo
   5. No console Firebase, ative o Firestore:
      Firestore Database → Criar banco de dados → Modo de produção
   6. Configure as Regras do Firestore (aba "Regras"):
   
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /{document=**} {
            allow read, write: if true;
          }
        }
      }
   
   ⚠️  As regras acima permitem acesso total (adequado para uso pessoal).
       Para produção com múltiplos usuários, restrinja por autenticação.
════════════════════════════════════════════ */

const firebaseConfig = {
  apiKey: "AIzaSyBxsLKGGvkLysCl6aed1UZbrXPk9K5TT2k",
  authDomain: "controle-financeiro-9e09b.firebaseapp.com",
  projectId: "controle-financeiro-9e09b",
  storageBucket: "controle-financeiro-9e09b.firebasestorage.app",
  messagingSenderId: "238867772198",
  appId: "1:238867772198:web:3a1d98ca48924c2f62c7e7"
};
