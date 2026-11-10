// Widget do TaskON para o iPhone (app Scriptable). O TaskON coloca a chave abaixo ao gerar o script.
// O visual vem do site (widget-ui.js): melhorias chegam sozinhas, sem colar de novo.
const TOKEN = '__TASKON_WIDGET_TOKEN__';
const UI_URL = 'https://luisgoo7.github.io/taskon/widget-ui.js';

const fm = FileManager.local();
const cachePath = fm.joinPath(fm.cacheDirectory(), 'taskon-widget-ui.js');
let code = null;
try {
  const req = new Request(UI_URL);
  req.timeoutInterval = 15;
  const fresh = await req.loadString();
  if (req.response.statusCode !== 200) throw new Error();
  fm.writeString(cachePath, fresh);
  code = fresh;
} catch {
  // Sem internet: usa a última versão baixada
  if (fm.fileExists(cachePath)) code = fm.readString(cachePath);
}

if (code) {
  const AsyncFunction = (async () => {}).constructor;
  await new AsyncFunction('TOKEN', code)(TOKEN);
} else {
  const widget = new ListWidget();
  widget.backgroundColor = new Color('#0a0f1c');
  widget.url = 'https://luisgoo7.github.io/taskon/';
  const t = widget.addText('TaskON: sem conexão');
  t.textColor = new Color('#7c89a8');
  t.font = Font.mediumSystemFont(12);
  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentMedium();
  Script.complete();
}
