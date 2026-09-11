import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const hub = await readFile(new URL("../deploy/hub/index.html", import.meta.url), "utf8");

test("contact form clearly explains the mail client handoff", () => {
  assert.match(hub, /Abrir e-mail para pedir orçamento/);
  assert.match(
    hub,
    /Ao continuar, seu\s+aplicativo de e-mail será aberto com a mensagem preenchida\./,
  );
  assert.match(hub, /id="cm-form-status"/);
  assert.match(hub, /Se seu aplicativo de e-mail não abrir, escreva para contato@eltonmarques\.com/);
});

test("project actions identify the destination before the visitor clicks", () => {
  assert.match(hub, /Acessar sistema restrito/);
  assert.match(hub, /Abrir leitor/);
  assert.match(hub, /Abrir sátira/);
});

test("footer does not repeat the contact and social controls", () => {
  const footer = hub.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? "";
  assert.doesNotMatch(footer, /cm-social/);
});
