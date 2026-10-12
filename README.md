# GameChat

Aplicativo dividido em duas partes para publicar o frontend na Vercel e o backend
no Render:

- `frontend/`: página estática e interface.
- `backend/`: API, salas, Socket.IO e sinalização WebRTC.

## Subir o código ao GitHub

Envie o projeto inteiro para um único repositório. Inclua as pastas `frontend/` e
`backend/`, além de `render.yaml`, `package.json`, `.gitignore` e este README.
Na pasta local do projeto, você pode enviar as alterações com:

```sh
git add .
git commit -m "Separa frontend e backend para deploy"
git push
```

Não envie `node_modules/`, `frontend/dist/` nem arquivos `.env`; o `.gitignore`
já os exclui. Se ainda não conectou essa pasta ao repositório do GitHub, siga no
GitHub as instruções **push an existing repository** para adicionar o remoto.

## Publicar o backend no Render

1. No Render, escolha **New > Blueprint** e conecte o repositório do GitHub.
2. O Render encontrará `render.yaml` na raiz e criará o serviço `gamechat-api`.
   A configuração já define `backend/` como diretório do serviço.
3. Aguarde o deploy e copie a URL HTTPS do serviço, por exemplo
   `https://gamechat-api.onrender.com`.
4. Abra `https://SUA-URL.onrender.com/health`. A resposta esperada é
   `{"ok":true}`.

## Publicar o frontend na Vercel

1. Na Vercel, escolha **Add New > Project** e importe o mesmo repositório.
2. Em **Root Directory**, escolha `frontend`.
3. Confirme que o framework é **Other**. O `vercel.json` já configura o comando
   `npm run build` e a pasta de saída `dist`.
4. Antes de publicar, abra **Environment Variables** e crie:
   - Nome: `GAMECHAT_SERVER_URL`
   - Valor: a URL HTTPS do Render, sem barra no final, por exemplo
     `https://gamechat-api.onrender.com`
   Se preferir, configure a variável nas configurações do projeto Vercel e faça
   um novo deploy.
5. Publique e copie o domínio HTTPS que a Vercel fornecer, por exemplo
   `https://gamechat.vercel.app`.

## Ligar a Vercel ao Render

1. No Render, abra o serviço `gamechat-api` e vá a **Environment**.
2. Crie `FRONTEND_URL` com o domínio do frontend Vercel, sem barra no final,
   por exemplo `https://gamechat.vercel.app`.
3. Salve as alterações e aguarde o Render reiniciar/reimplantar o serviço.
4. Abra o domínio Vercel, entre em uma sala e clique em **Copiar convite**.
   Envie esse link ao seu amigo; ele informa o nome e entra na sala preenchida.
5. Para compartilhar, clique em **Compartilhar tela** e escolha o jogo ou a tela.
   O navegador pede autorização. Use um navegador compatível e mantenha o app
   aberto durante a transmissão.

Depois de mudar `GAMECHAT_SERVER_URL` na Vercel, faça um novo deploy, pois o valor
é incorporado ao frontend durante o build. Se adicionar um domínio personalizado
na Vercel, atualize também `FRONTEND_URL` no Render para esse domínio. O Render
precisa permitir uma única instância, porque as salas e os participantes ficam
na memória do processo. O plano gratuito pode suspender o serviço após inatividade,
causando demora ao primeiro acesso. Redes restritivas podem precisar de um serviço
TURN para estabelecer a conexão de compartilhamento WebRTC.
