#!/usr/bin/env node
/**
 * 색인 채우기 러너 — `scripts/data/age-index-todo.json` 순서(구역이 많은 동부터)로
 * 아직 색인이 없는 법정동을 `build-age-index.mjs` 로 채운다.
 *
 *   node scripts/fill-age-index.mjs [초]
 *
 * · 셸 호출 한 번이 오래 걸리지 않도록 **시간 예산(기본 260초)** 안에서만 돌고 멈춘다.
 *   다시 부르면 이미 만든 파일은 건너뛰고 이어서 채운다(이어 돌리기).
 * · 남은 동은 `scripts/data/age-index-todo.json` 에서 빠지지 않는다 — 이미 있는 파일만 건너뛴다.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const budget = Number(process.argv[2] ?? 260) * 1000;
const started = Date.now();
const todo = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts/data/age-index-todo.json"), "utf8"));
const dir = path.join(process.cwd(), "public/data/age-index");

const left = todo.filter((cd) => !fs.existsSync(path.join(dir, `${cd}.json`)));
console.log(`남은 법정동 ${left.length}곳 · 예산 ${budget / 1000}s`);

let done = 0;
for (const cd of left) {
  if (Date.now() - started > budget) break;
  try {
    const out = execFileSync(process.execPath, ["scripts/build-age-index.mjs", cd], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 120_000,
    });
    const line = out.trim().split("\n").pop() ?? "";
    console.log(line);
    done++;
  } catch (e) {
    console.log(`${cd} — 실패: ${(e.message ?? "").split("\n")[0].slice(0, 120)}`);
  }
}
const after = todo.filter((cd) => !fs.existsSync(path.join(dir, `${cd}.json`))).length;
console.log(`이번에 ${done}곳 완료 · 남은 ${after}곳 · ${((Date.now() - started) / 1000).toFixed(0)}s`);
