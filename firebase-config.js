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
  apiKey: "AIzaSyBboODI6OWY-MkzeM2acgcXCu33_pGt5Ro",
  authDomain: "painel-financeiro-316bc.firebaseapp.com",
  projectId: "painel-financeiro-316bc",
  storageBucket: "painel-financeiro-316bc.firebasestorage.app",
  messagingSenderId: "237593887820",
  appId: "1:237593887820:web:22071fd05bfee8822260e9"
};
