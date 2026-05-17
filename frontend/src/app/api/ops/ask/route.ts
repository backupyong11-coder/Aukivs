import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = body.query as string;
    const platformMaster = body.platformMaster ?? [];
    const worksMaster = body.worksMaster ?? [];
    const memos = body.memos ?? [];
    const tasks = body.tasks ?? [];
    const checklist = body.checklist ?? [];

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "API 키 없음" }, { status: 500 });
    }

    const systemPrompt = `너는 웹툰 운영 관제실 AI 어시스턴트다. 아래 데이터를 바탕으로 사용자 질문에 답한다.

## 플랫폼정리 (계약·진행 플랫폼, 시트 헤더=필드명)
${JSON.stringify(platformMaster, null, 2)}

## 작품정리 (작품 목록, 시트 헤더=필드명 — 작품명·현재상태·연령등급·UCI·태그·연재 사이트 등)
${JSON.stringify(worksMaster, null, 2)}

## 업무정리 (발췌된 행만 전달될 수 있음)
${JSON.stringify(tasks, null, 2)}

## 체크리스트 (긴급·일일 항목 등, 발췌)
${JSON.stringify(checklist, null, 2)}

## 메모장
${JSON.stringify(memos, null, 2)}

답변 규칙:
- 첫 줄에 답의 성격을 한국어 대괄호 태그로 한 개만 적는다. 예: [DB 즉각 조회] [필터링] [태스크 매칭] [요약] 중 질문에 가장 맞는 하나.
- 둘째 줄부터 본문. 질문과 관련된 정보만 골라서 간결하게 답한다.
- 담당자, 연락처, 이메일, 현재단계, 마감일, 우선순위 등 핵심 정보를 우선 표시한다.
- 없는 정보는 "정보 없음"으로 표시한다.
- 마크다운 없이 깔끔한 텍스트로 답한다.
- 한국어로 답한다`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: query }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errObj: unknown;
      try { errObj = JSON.parse(errText); } catch { errObj = { message: errText }; }
      return NextResponse.json({ error: errObj }, { status: 500 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "응답 없음";
    return NextResponse.json({ answer: text });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
