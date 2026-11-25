# NuTrick

Aplicativo PWA pessoal para registro alimentar e acompanhamento nutricional.

## Publicar pelo GitHub Pages

1. Abra **Settings → Pages** neste repositório.
2. Em **Build and deployment**, selecione **Deploy from a branch**.
3. Escolha a branch **main** e a pasta **/(root)** e clique em **Save**.
4. Aguarde a publicação. O endereço esperado é https://ihavenoname312.github.io/NuTrick/.
5. No iPhone, abra o endereço pelo Safari, toque em **Compartilhar → Adicionar à Tela de Início**.

## O que esta versão inclui

- Painel de calorias e macronutrientes.
- Metas editáveis e registro de água.
- Diário alimentar com histórico local.
- Cadastro manual e pesquisa de alimentos.
- Registro por texto e botão **Analisar macros**.
- Perguntas de esclarecimento e confirmação antes de salvar estimativas.
- Sugestões simples de refeições recorrentes.
- Registro de peso e cintura.
- Exportação e importação de backup JSON.
- Armazenamento no navegador e cache offline após a primeira visita em HTTPS.

## Limitações da versão atual

- A interpretação de texto é local e baseada em regras, **não é uma IA conectada**.
- Os valores do catálogo inicial são **ilustrativos**, ainda não foram verificados contra a TACO, Open Food Facts ou rótulos reais. Não os use como referência nutricional.
- Scanner de código de barras e sincronização em nuvem ainda não foram implementados.
- Os dados alimentares ficam neste navegador/dispositivo. Limpar os dados do Safari pode apagá-los; exporte backups regularmente.

## Executar localmente

Com Python instalado, execute na pasta do projeto:

```bash
python -m http.server 8000
```

Abra http://localhost:8000.

## Estrutura

- `index.html`: interface e lógica da primeira versão.
- `manifest.webmanifest`: metadados PWA.
- `sw.js`: cache offline.
- `icon.svg`: ícone vetorial.
