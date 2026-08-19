# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This repository is at an early, pre-code stage. There is no application code,
build system, package manifest, or tests yet — only raw source data and a
generic UI template. Do not invent build/lint/test commands; none exist.

The eventual goal is an app that reads the data in `dados/csv/` and renders
it through a UI built on top of `design-system/`. The tech stack for that app
has **not been decided yet** — do not assume or scaffold a specific
framework (Python, Node, etc.) without confirming with the user first.

## Data (`dados/csv/`)

Portuguese, comma-delimited, accented (UTF-8), with quoted multi-line fields.
Three kinds of files:

- **Monthly usage logs** — `JANEIRO.csv`, `FEVEVEIRO.csv` (filename typo in
  the source data — literally spelled this way, not "FEVEREIRO"),
  `MARÇO.csv`, `ABRIL.csv`. Each is a "Cartão Mestre" (Master Card) override
  log: who bypassed a checkout/access restriction, when, and which manager
  authorized it. Layout:
  - Row 1: banner — `Controle de Uso do Cartão Mestre,...,"FILIAL: 08\nCARUARU"`
  - Row 2: blank
  - Row 3: real header — `DATA,HORA,MATRÍCULA,NOME,SETOR,FUNÇÃO,MOTIVO,"RESPONSÁVEL\nPELA AUTORIZAÇÃO"`
  - Row 4+: one record per override event.
  - New months will likely follow this same 3-row-preamble format.

- **`COLABORADORES.csv`** — flat employee registry:
  `MATRÍCULA,NOME,FUNÇÃO,SETOR`. `MATRÍCULA` is the join key back to the
  monthly logs' `MATRÍCULA` column.

- **`GESTORES.csv`** — freeform list of authorized managers/approvers under
  the heading "GESTORES AUTORIZADOS" (not tabular). These are the values
  that populate the monthly logs' `RESPONSÁVEL PELA AUTORIZAÇÃO` column,
  sometimes prefixed with a group code (e.g. `GR4 - ANDRÉ VALENÇA`).

## UI shell (`design-system/`)

`design-system/index.html` + `design-system/assets/` (fonts, icons, JS) is a
generic, not-yet-customized static template export — it currently contains
no references to this project's domain (cartão, colaborador, gestor,
filial). Treat it as the intended starting point for the eventual app's UI,
not as a working example of this project's data model.
