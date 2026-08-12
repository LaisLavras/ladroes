# Changelog

Registro do que mudou em cada leva de commits. Serve pra checar rápido se uma
atualização específica já chegou no site publicado — compare a entrada mais
recente aqui com o hash mostrado no canto inferior direito do menu do jogo
(`git rev-parse --short HEAD` do commit que gerou aquele build).

## Não lançado

- Portas agora também abrem com ESPAÇO ou clique do mouse, além de E.
- Corrige vazamento visual da neblina: dava pra ver a sombra/lanterna de
  guardas na sala ao lado por causa da neblina não ser 100% opaca.
- O cofre agora fica sempre a exatamente 10 salas da entrada (mudando de
  posição a cada partida), em vez de distância variável — deixa os tempos do
  ranking comparáveis entre partidas. O resto do labirinto continua sendo
  gerado normalmente ao redor desse caminho fixo.
- Adiciona este changelog e um selo de build (commit + data) no canto do
  menu, pra dar pra confirmar visualmente qual versão está no ar.

## 2026-08-12 — `3275cff` Remove o modo Ladrões vs Segurança

- Tira o modo "Ladrões vs Segurança" do menu, do ranking e do servidor —
  papel do chefe, velocidade especial, captura e atravessar portas fechadas
  foram todos removidos.

## 2026-08-07 — `4101aa0` Ranking persistente via Firestore, feedback de sabotagem e ajustes de UI

- Ranking passa a gravar no Firestore (via `FIREBASE_SERVICE_ACCOUNT`) em vez
  de um arquivo local que sumia a cada deploy do Render.
- Sabotagem do Traidor ganha barra de progresso visual e som ao fechar uma
  porta de novo.
- Corrige o alarme de sabotagem sendo zerado no mesmo tick pela decadência
  normal.
- Banner do código da sala privada fica fixo e visível até um amigo entrar.
- Botões de iniciar partida unificados em só "JOGAR".

## 2026-08-07 — `cf5652d` Reverte piso, isola Singleplayer de verdade e mostra recarga de habilidade

- Corrige bug real de matchmaking: Singleplayer e Sala Privada caíam na fila
  pública, então um estranho podia entrar numa partida "sozinho". Agora
  Singleplayer cria sala privada com `maxClients=1` de verdade.
- Adiciona reloginho de recarga de habilidade no HUD.
- Reverte a textura de piso adicionada nos dois commits anteriores.

## 2026-08-07 — `f76efc1`, `82ca72b` Texturas de piso (revertidas depois)

- Testes de textura de piso (madeira, depois pedra) — descartados no commit
  seguinte.

## 2026-08-07 — `f17674e` Corrige corte de UI em janelas menores que 960px

## 2026-08-07 — `95c68f8` Corrige travamento do jogo ao conectar em servidor remoto

## 2026-08-07 — `d6f65de` Configuração inicial para deploy

- Primeira versão publicável: git, `.gitignore` e blueprint do Render.
