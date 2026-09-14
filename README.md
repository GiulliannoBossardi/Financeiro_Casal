# Painel Casal — Controle Financeiro

Aplicação web para controle financeiro de casal, com dados sincronizados em tempo real no **Firebase Firestore** e hospedagem gratuita no **GitHub Pages**.

## 📁 Estrutura de arquivos

```
├── index.html          → Estrutura da página (HTML)
├── estilo.css           → Estilos e temas (CSS)
├── script.js             → Lógica, CRUD e integração com Firebase (JavaScript)
├── firebase-config.js    → Suas credenciais do Firebase (edite este arquivo)
└── README.md              → Este arquivo
```

## ✨ Funcionalidades

- 👤 **Login por pessoa** — cada parceiro(a) tem seu próprio usuário e senha
- 💰 **Salários** — adiantamento, pagamento e bruto, por pessoa e por mês
- 🍽️ **Vale Refeição** — valor recebido, utilizado e saldo, por pessoa e por mês
- ➕ **Extras** — ganhos avulsos (hora extra, bônus, PLR...) por pessoa e por mês
- 📉 **Despesas** — à vista ou parceladas, com status pago/pendente, por categoria
- 📊 **Resumo** — visão consolidada do casal: entradas por pessoa, despesas por categoria e saldo do período
- ⚙️ **Configuração** — cadastro de pessoas, categorias de despesa e tipos de extra
- 🌓 Tema claro/escuro, sidebar retrátil e layout responsivo

Todos os dados são compartilhados entre as pessoas cadastradas (é um painel do casal), sincronizados em tempo real via Firestore — o que um parceiro lança aparece automaticamente para o outro.

## 🚀 Passo a passo para publicar

### 1. Criar o projeto no Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com) e crie um novo projeto.
2. No painel do projeto, clique em **Adicionar app → Web (`</>`)**.
3. Copie o objeto `firebaseConfig` gerado.
4. Abra o arquivo `firebase-config.js` deste projeto e cole seus valores no lugar dos placeholders.
5. No menu lateral, vá em **Firestore Database → Criar banco de dados** (modo produção, escolha a região mais próxima, ex. `southamerica-east1`).
6. Na aba **Regras**, cole:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> ⚠️ Essas regras liberam leitura/escrita para quem tiver o link do site. Adequado para uso pessoal entre duas pessoas de confiança. Para mais segurança, considere ativar o Firebase Authentication no futuro.

### 2. Subir para o GitHub

1. Crie um repositório novo no GitHub (ex. `painel-casal`).
2. Suba estes 5 arquivos para a raiz do repositório.
3. Vá em **Settings → Pages**, selecione a branch `main` e a pasta `/root`, e salve.
4. Em alguns minutos o site estará disponível em:
   `https://SEU-USUARIO.github.io/painel-casal/`

### 3. Primeiro acesso

- Usuários padrão: **Parceiro 1** e **Parceiro 2**, senha `1234` para ambos.
- Depois de logar, vá em **Configuração** para renomear as pessoas (ou adicionar outras), e no menu do avatar (canto superior direito) use **Trocar senha** para definir uma senha própria.
- Ajuste as categorias de despesa e os tipos de extra em **Configuração** conforme a realidade de vocês.

## 💾 Sobre os dados

Os dados ficam salvos no Firestore (nuvem), não no navegador — por isso funcionam em qualquer dispositivo e são compartilhados entre as duas pessoas automaticamente, sem necessidade de backup manual.

---

Painel Casal v1.0.0 · Feito com ♥
