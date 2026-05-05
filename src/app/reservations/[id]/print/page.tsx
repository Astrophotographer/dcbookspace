import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { SetupNeeded } from "@/components/setup-needed";
import { qrDataUrl } from "@/lib/qr";
import { formatDate, formatUsageRange, resolveBaseUrl } from "@/lib/utils";
import type { ReservationDetail } from "@/lib/repo";
import type { ApprovalStep, AppUser } from "@/lib/supabase/types";
import { PrintAuto } from "./print-auto";

export default async function PrintPage(
  props: PageProps<"/reservations/[id]/print">,
) {
  if (!isSupabaseConfigured()) return <SetupNeeded />;

  const { id } = await props.params;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(
      `*,
       room:rooms (*, floor:floors (*, building:buildings(*))),
       applicant:users!applicant_id (*),
       dept:departments (*),
       approvals (*, approver:users!approver_id (*)),
       route:approval_routes (*)`,
    )
    .eq("id", id)
    .single();
  if (error || !data) notFound();
  const r = data as unknown as ReservationDetail;

  let elder: AppUser | null = null;
  if (r.dept_id) {
    const { data: dep } = await supabase
      .from("departments")
      .select("*, elder:users!elder_id (*)")
      .eq("id", r.dept_id)
      .single();
    elder =
      ((dep as unknown as { elder: AppUser | null } | null)?.elder) ?? null;
  }

  const h = await headers();
  const baseUrl = resolveBaseUrl({
    envUrl: process.env.NEXT_PUBLIC_APP_URL,
    host: h.get("host"),
    proto: h.get("x-forwarded-proto"),
  });
  const qrUrl = `${baseUrl}/sign/${r.qr_token}`;
  const qr = await qrDataUrl(qrUrl, 110);

  const apprByOrder = new Map(r.approvals.map((a) => [a.step_order, a]));
  const steps = r.route.steps as ApprovalStep[];
  const createdLabel = formatDate(r.created_at, "yyyy년 M월 d일");

  return (
    <>
      <PrintAuto />
      <main className="print-main">
        <div className="print-notice">
          <strong>인쇄 팁:</strong> 인쇄 대화상자에서{" "}
          <b>추가 설정(More settings) → 머리글 및 바닥글(Headers and footers)</b>{" "}
          체크를 해제하시면 상·하단의 URL·시간·페이지 번호가 사라집니다.
        </div>
        <div className="container">
          <h1 className="title">장소 사용 신청서</h1>

          {/* 우측 상단: QR + 결재란 */}
          <div className="approval-wrapper">
            <div className="qr-box">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR은 인쇄용 base64 data URL. next/image의 lazy load·WebP 변환은 인쇄 품질 저하 */}
              <img src={qr} alt="전자결재용 QR" width={92} height={92} />
              <div className="qr-caption">전자결재용 QR</div>
            </div>
            <table className="approval-table">
              <tbody>
                <tr>
                  <th rowSpan={2} className="approval-stamp">
                    결<br />
                    <br />재
                  </th>
                  {steps.map((step) => (
                    <th key={step.order} className="approval-head">
                      {step.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  {steps.map((step) => {
                    const a = apprByOrder.get(step.order);
                    return (
                      <td key={step.order} className="approval-cell">
                        {a?.status === "approved" ? (
                          <div className="signed">
                            <div className="signed-name">
                              {a.approver?.name ?? ""}
                            </div>
                          </div>
                        ) : a?.status === "rejected" ? (
                          <div className="rejected">반려</div>
                        ) : a?.status === "skipped" ? (
                          <div className="skipped">건너뜀</div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="content-body">
            아래와 같이 장소를 사용하고자 하오니 허락하여 주시기 바랍니다. 끝.
          </div>

          {/* 사용 정보 */}
          <div className="form-section">
            <FormLine label="사용일시">
              {formatUsageRange(r.start_at, r.end_at)}
            </FormLine>
            <FormLine label="사용장소">
              {r.room.floor.building.name} {r.room.floor.label} {r.room.name}
            </FormLine>
            <FormLine label="사용목적">{r.purpose}</FormLine>
            <FormLine label="사용인원">
              {r.attendee_count}명{r.is_external && " (외부행사)"}
            </FormLine>
          </div>

          {/* 신청자 정보 (우측 하단) */}
          <div className="signature-section">
            <SigRow label="신청부서">{r.dept?.name ?? ""}</SigRow>
            <SigRow label="신청자" stamp>
              {r.applicant.name}
            </SigRow>
            <SigRow label="전화번호">{r.applicant.phone ?? ""}</SigRow>
            <SigRow label="지도장로" stamp>
              {elder?.name ?? ""}
            </SigRow>
          </div>

          <div className="date-section">신 청 일 : {createdLabel}</div>

          <div className="ref-no">신청번호 {r.ref_no}</div>
        </div>

        <style>{`
          @page { size: A4 portrait; margin: 20mm; }

          .print-main {
            background: #d8d8d8;
            padding: 24px 0;
            min-height: 100vh;
          }
          .print-notice {
            max-width: 170mm;
            margin: 0 auto 16px;
            padding: 12px 16px;
            background: #fff8db;
            border: 1px solid #e8c84a;
            border-radius: 6px;
            font-size: 13px;
            line-height: 1.5;
            color: #5a4a00;
          }
          .container {
            font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
            color: #222;
            background: #fff;
            box-shadow: 0 0 12px rgba(0,0,0,.15);
            width: 170mm;            /* A4 - 양쪽 20mm 여백 */
            min-height: 257mm;       /* A4 세로 - 위아래 20mm */
            margin: 0 auto;
            padding: 12mm;
            box-sizing: border-box;
            position: relative;
            display: flex;
            flex-direction: column;
          }

          .title {
            text-align: center;
            font-size: 28pt;
            letter-spacing: 15px;
            margin: 30px 0 30px;
            font-weight: bold;
          }

          .approval-wrapper {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 36px;
          }
          .qr-box {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            margin-left: 14mm;
          }
          .qr-caption {
            font-size: 9pt;
            font-weight: 600;
          }
          .approval-table {
            border-collapse: collapse;
            width: 300px;
            text-align: center;
          }
          .approval-table th, .approval-table td {
            border: 1px solid #000;
            padding: 4px;
            font-size: 10pt;
          }
          .approval-stamp {
            width: 22px;
            background: #f7f7f7;
            font-weight: bold;
            line-height: 1.1;
          }
          .approval-head {
            height: 24px;
            background: #f7f7f7;
          }
          .approval-cell {
            height: 60px;
            vertical-align: middle;
          }
          .signed-name {
            font-size: 10pt;
            font-weight: 600;
            color: #0c8a5e;
          }
          .rejected {
            color: #b91c1c;
            font-weight: bold;
          }
          .skipped {
            color: #888;
            font-size: 9pt;
          }

          .content-body {
            text-align: center;
            font-size: 14pt;
            margin: 40px 0 50px;
            line-height: 2;
          }

          .form-section {
            margin: 0 12mm 40px;
          }
          .form-group {
            display: flex;
            align-items: flex-end;
            margin-bottom: 22px;
          }
          .form-label {
            font-size: 12pt;
            font-weight: bold;
            width: 110px;
            white-space: nowrap;
          }
          .form-input-line {
            flex: 1;
            border-bottom: 1px solid #000;
            padding: 0 4px 3px;
            font-size: 12pt;
            min-height: 24px;
          }

          .signature-section {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            margin: 24px 12mm 0 0;
          }
          .sig-row {
            display: flex;
            align-items: flex-end;
            margin-bottom: 12px;
            width: 280px;
          }
          .sig-label {
            width: 92px;
            font-size: 11pt;
            font-weight: bold;
            white-space: nowrap;
          }
          .sig-line {
            flex: 1;
            border-bottom: 1px solid #000;
            padding: 0 32px 3px 8px;
            font-size: 11pt;
            min-height: 22px;
            position: relative;
          }
          .sig-stamp {
            position: absolute;
            right: 4px;
            bottom: 2px;
            border: 1px solid #000;
            border-radius: 50%;
            width: 18px;
            height: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 8pt;
          }

          .date-section {
            text-align: center;
            font-size: 14pt;
            font-weight: bold;
            margin-top: auto;
            padding-top: 30px;
            padding-bottom: 18mm;
          }
          .ref-no {
            position: absolute;
            right: 8mm;
            bottom: 4mm;
            font-size: 9pt;
            color: #555;
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          }

          @media print {
            html, body { background: #fff !important; margin: 0; padding: 0; }
            .print-main { background: #fff; padding: 0; min-height: 0; }
            .print-notice { display: none; }
            .container {
              width: auto;
              min-height: calc(297mm - 40mm);
              max-height: calc(297mm - 40mm);
              margin: 0;
              box-shadow: none;
              overflow: hidden;
            }
          }
        `}</style>
      </main>
    </>
  );
}

function FormLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="form-group">
      <div className="form-label">* {label} :</div>
      <div className="form-input-line">{children}</div>
    </div>
  );
}

function SigRow({
  label,
  children,
  stamp,
}: {
  label: string;
  children: React.ReactNode;
  stamp?: boolean;
}) {
  return (
    <div className="sig-row">
      <div className="sig-label">{label} :</div>
      <div className="sig-line">
        {children}
        {stamp && <div className="sig-stamp">인</div>}
      </div>
    </div>
  );
}
