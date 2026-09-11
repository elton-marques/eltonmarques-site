import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

const hub = await readFile(new URL("../deploy/hub/index.html", import.meta.url), "utf8");
const invarlyIcon = await readFile(
  new URL("../deploy/hub/assets/invarly-app-icon.svg", import.meta.url),
  "utf8",
);

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

test("project section includes Invarly and omits the old OCR test report", () => {
  assert.match(hub, /Invarly/);
  assert.match(hub, /https:\/\/invarly\.eltonmarques\.com/);
  assert.match(hub, /assets\/invarly-app-icon\.svg\?v=2/);
  assert.match(hub, /cm-tag-violet/);
  assert.match(invarlyIcon, /fill="#2e1065"/);
  assert.match(invarlyIcon, /stroke="#a78bfa"/);
  assert.doesNotMatch(hub, /Em teste com 5 folhas reais/);
});

test("project cards keep readable equal-size tiles and prioritize Invarly", () => {
  const projects = hub.match(/<section\b[^>]*\bid="projetos"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";

  assert.match(projects, /grid-cols-1 sm:grid-cols-2 gap-4 mt-10/);
  assert.doesNotMatch(projects, /lg:grid-cols-4/);
  assert.doesNotMatch(hub, /sm:col-span-2/);
  assert.match(
    hub,
    /A portaria registrava as liberações do cartão mestre em papel, sem/,
  );
  assert.doesNotMatch(projects, /order-first/);
  assert.match(projects, /cm-card cm-card--stack cm-project-card cm-reveal p-6 order-1/);
  assert.match(projects, /cm-card cm-card--stack cm-project-card cm-reveal p-6 order-2/);
  assert.match(projects, /cm-card cm-card--stack cm-project-card cm-reveal p-6 order-3/);
  assert.match(projects, /cm-card cm-card--stack cm-project-card cm-reveal p-6 order-4/);
});

test("project cards share one footer pattern and one desktop height", () => {
  const projects = hub.match(/<section\b[^>]*\bid="projetos"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";
  const cardOpenings = projects.match(/cm-card cm-card--stack cm-project-card cm-reveal p-6 order-[1-4]/g) ?? [];

  assert.match(hub, /\.cm-project-card\s*\{[\s\S]*min-height: 31\.75rem;/);
  assert.equal(cardOpenings.length, 4);
  assert.equal(
    (projects.match(/cm-rule cm-card__foot flex items-center justify-between gap-3/g) ?? []).length,
    4,
  );
  const cartaoStart = projects.indexOf('<h3 class="text-lg font-semibold mt-4">Cartão Mestre</h3>');
  const cartaoEnd = projects.indexOf('<h3 class="text-lg font-semibold mt-4">MestreCheck</h3>');
  const cartao = projects.slice(cartaoStart, cartaoEnd);
  assert.doesNotMatch(cartao, /flex flex-col/);
  assert.match(cartao, /Ver demo/);
  assert.match(cartao, /Acessar sistema restrito/);
});

test("all project cards remain inside the shared two-column grid", () => {
  const projects = hub.match(/<section\b[^>]*\bid="projetos"[^>]*>[\s\S]*?<\/section>/)?.[0] ?? "";
  const mestreCheck = projects.indexOf('class="cm-card cm-card--stack cm-project-card cm-reveal p-6 order-3"');
  const beforeMestreCheck = projects.slice(0, mestreCheck);

  assert.doesNotMatch(beforeMestreCheck, /<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<div\s*$/);
});
