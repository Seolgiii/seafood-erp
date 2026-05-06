import "server-only";

/**
 * Resend 이메일 전송 — fetch 직접 호출 (외부 의존성 0)
 *
 * 환경변수:
 *  - RESEND_API_KEY (필수)
 *  - ALERT_EMAIL_FROM (선택, 기본: "SEAERP <onboarding@resend.dev>")
 */

const RESEND_API = "https://api.resend.com/emails";
const DEFAULT_FROM = "SEAERP <onboarding@resend.dev>";

interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  /** override 가능. 없으면 ALERT_EMAIL_FROM 또는 DEFAULT_FROM 사용 */
  from?: string;
}

interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY 미설정" };
  }

  const from =
    params.from?.trim() ||
    process.env.ALERT_EMAIL_FROM?.trim() ||
    DEFAULT_FROM;

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return {
      ok: false,
      error: `Resend ${res.status}: ${errText.slice(0, 300)}`,
    };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: data.id };
}
