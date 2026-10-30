"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { getDictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatNumber } from "@/i18n/format";
import type { ImportCommitDTO, ImportPreviewDTO } from "@/lib/dto";
import {
  Button,
  ButtonLink,
  ErrorState,
  ForbiddenState,
  IconDownload,
  IconFile,
  Ltr,
  Notice,
  OfflineState,
  Panel,
  SkeletonLine,
  SkeletonTitle,
  Toast,
  apiFetch,
  messageFor,
  useToast,
  type DesignedState,
} from "@/components/ui";
import { dateTimeText } from "./labels";
import styles from "./screens.module.css";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Import is tool-first: drop → preview → commit. Nothing is stored until the
 * commit, a rejected row is shown with its reason and is never repaired behind
 * the seller's back, and the file stays in place when the server says no.
 */
export function ImportScreen({
  locale,
  state,
  role,
}: {
  locale: Locale;
  state: DesignedState | null;
  role: "owner" | "operator";
}) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { toast, show, clear } = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<{ name: string; size: number; format: "json" | "csv"; content: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewDTO | null>(null);
  const [committed, setCommitted] = useState<ImportCommitDTO | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | "read" | null>(null);

  const loading = state === "loading";
  const designedKind = state && state !== "empty" && state !== "loading" ? state : null;

  async function readFile(selected: File) {
    setPreview(null);
    setCommitted(null);
    if (selected.size > MAX_BYTES) {
      show(dict.import.fileTooBig, "error");
      return;
    }
    const extension = selected.name.toLowerCase().split(".").pop();
    const format = extension === "csv" ? "csv" : extension === "json" ? "json" : null;
    if (!format) {
      show(dict.import.badFormat, "error");
      return;
    }
    setBusy("read");
    try {
      const content = await selected.text();
      setFile({ name: selected.name, size: selected.size, format, content });
      show(dict.import.selected);
    } catch {
      show(dict.import.readFailed, "error");
    } finally {
      setBusy(null);
    }
  }

  async function runPreview() {
    if (!file) {
      show(dict.import.needFile, "error");
      return;
    }
    setBusy("preview");
    const result = await apiFetch<ImportPreviewDTO>("/api/import/preview", {
      method: "POST",
      body: JSON.stringify({ format: file.format, filename: file.name, content: file.content }),
    });
    setBusy(null);
    if (result.ok) {
      setPreview(result.data);
    } else {
      show(messageFor(result.error, dict), "error");
    }
  }

  async function runCommit() {
    if (!file) {
      show(dict.import.needFile, "error");
      return;
    }
    if (!preview) {
      show(dict.import.previewFirst, "error");
      return;
    }
    setBusy("commit");
    const result = await apiFetch<ImportCommitDTO>("/api/import/commit", {
      method: "POST",
      body: JSON.stringify({ format: file.format, filename: file.name, content: file.content }),
    });
    setBusy(null);
    if (result.ok) {
      setCommitted(result.data);
      router.refresh();
    } else {
      show(messageFor(result.error, dict), "error");
    }
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setCommitted(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.h1}>{dict.import.title}</h1>
          <p className={styles.lede}>{dict.import.subtitle}</p>
          <p className={styles.lede}>{dict.import.limits}</p>
        </div>
        <div className={styles.headAside}>
          {role === "operator" ? <span className={styles.cellMeta}>{dict.common.operator}</span> : null}
        </div>
      </header>

      {designedKind === "error" ? (
        <ErrorState
          dict={dict}
          action={
            <ButtonLink href={`/${locale}/import`} variant="ghost">
              {dict.screen.retry}
            </ButtonLink>
          }
        />
      ) : designedKind === "offline" ? (
        <OfflineState dict={dict} locale={locale} />
      ) : designedKind === "forbidden" ? (
        <ForbiddenState dict={dict} locale={locale} />
      ) : (
        <div className={styles.importGrid}>
          <div>
            {loading ? (
              <div className={styles.skelStack} aria-hidden="true">
                <SkeletonTitle width="42%" />
                <SkeletonLine width="86%" />
                <SkeletonLine width="64%" />
              </div>
            ) : committed ? (
              <div className={styles.blockSection}>
                <h2 className={styles.sectionTitle}>{dict.import.resultTitle}</h2>
                <div className={styles.countsRow}>
                  <div className={styles.countItem}>
                    <span className={styles.countValue}>{formatNumber(committed.imported, locale)}</span>
                    <span className={styles.countLabel}>{dict.import.imported}</span>
                  </div>
                  <div className={styles.countItem}>
                    <span className={styles.countValue}>{formatNumber(committed.duplicates, locale)}</span>
                    <span className={styles.countLabel}>{dict.import.duplicateRows}</span>
                  </div>
                  <div className={styles.countItem}>
                    <span className={styles.countValue}>{formatNumber(committed.rejected, locale)}</span>
                    <span className={styles.countLabel}>{dict.import.rejectedRows}</span>
                  </div>
                </div>
                <p className={styles.docNote}>{dict.import.note}</p>
                <div className={styles.inlineForm}>
                  <ButtonLink href={`/${locale}/inbox`} variant="ghost">
                    {dict.import.goInbox}
                  </ButtonLink>
                  <Button variant="quiet" onClick={reset}>
                    {dict.import.another}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <label
                  className={styles.dropzone}
                  data-active={dragging ? "true" : undefined}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    const dropped = event.dataTransfer.files?.[0];
                    if (dropped) void readFile(dropped);
                  }}
                >
                  <IconDownload size={22} />
                  <span className={styles.dropTitle}>{dragging ? dict.import.dropActive : dict.import.dropTitle}</span>
                  <span className={styles.dropBody}>{dict.import.dropBody}</span>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".json,.csv,application/json,text/csv"
                    className="visually-hidden"
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      if (selected) void readFile(selected);
                    }}
                  />
                  <span className={styles.filter}>{dict.import.choose}</span>
                </label>

                {file ? (
                  <div className={styles.blockSection}>
                    <div className={styles.rowBetween}>
                      <span className={styles.fileChip}>
                        <IconFile size={14} />
                        <Ltr mono>{file.name}</Ltr>
                        <span className={styles.cellMeta}>
                          {formatNumber(Math.max(1, Math.round(file.size / 1024)), locale)} KB
                        </span>
                      </span>
                      <div className={styles.inlineForm}>
                        <Button variant="ghost" small onClick={runPreview} disabled={busy !== null}>
                          {busy === "preview" ? dict.import.previewing : dict.import.preview}
                        </Button>
                        <Button variant="quiet" small onClick={reset} disabled={busy !== null}>
                          {dict.import.clear}
                        </Button>
                      </div>
                    </div>
                    <Notice>{dict.import.notCommitted}</Notice>
                  </div>
                ) : null}

                {preview ? (
                  <>
                    <div className={styles.blockSection}>
                      <div className={styles.sectionHead}>
                        <h2 className={styles.sectionTitle}>{dict.import.preview}</h2>
                      </div>
                      <div className={styles.countsRow}>
                        <div className={styles.countItem}>
                          <span className={styles.countValue}>{formatNumber(preview.accepted, locale)}</span>
                          <span className={styles.countLabel}>{dict.import.accepted}</span>
                        </div>
                        <div className={styles.countItem}>
                          <span className={styles.countValue}>{formatNumber(preview.rejected, locale)}</span>
                          <span className={styles.countLabel}>{dict.import.rejected}</span>
                        </div>
                        <div className={styles.countItem}>
                          <span className={styles.countValue}>{formatNumber(preview.duplicateRisk, locale)}</span>
                          <span className={styles.countLabel}>{dict.import.duplicates}</span>
                        </div>
                      </div>
                      <p className={styles.docNote}>
                        {dict.import.limits} · {formatNumber(preview.limits.maxRows, locale)} {dict.import.rows} ·{" "}
                        {formatNumber(Math.round(preview.limits.maxBytes / (1024 * 1024)), locale)} MB
                      </p>
                    </div>

                    <div className={styles.blockSection}>
                      <h3 className={styles.sectionTitle}>{dict.import.columnsTitle}</h3>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th className={styles.th}>{dict.import.columnsTitle}</th>
                            <th className={styles.th}>{dict.import.mapped}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.columns.map((column) => (
                            <tr key={column.key} className={styles.tr}>
                              <td className={styles.td}>
                                <Ltr mono>{column.key}</Ltr>
                                {column.label !== column.key ? (
                                  <span className={styles.cellSub}>{column.label}</span>
                                ) : null}
                              </td>
                              <td className={styles.td}>
                                {column.mappedTo ? (
                                  <Ltr mono>{column.mappedTo}</Ltr>
                                ) : (
                                  <span className={styles.unmeasured}>{dict.import.unmapped}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className={styles.blockSection}>
                      <h3 className={styles.sectionTitle}>{dict.import.sampleTitle}</h3>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th className={styles.th}>{dict.import.rowNumber}</th>
                            <th className={styles.th}>{dict.common.customer}</th>
                            <th className={styles.th}>{dict.inbox.threadLabel}</th>
                            <th className={`${styles.th} ${styles.thEnd}`}>{dict.evaluation.colAt}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.sample.map((row) => (
                            <tr key={row.row} className={styles.tr}>
                              <td className={styles.td}>{formatNumber(row.row, locale)}</td>
                              <td className={styles.td}>{row.customer}</td>
                              <td className={styles.td}>{row.text}</td>
                              <td className={`${styles.td} ${styles.tdEnd}`}>
                                <span className={styles.cellMeta}>{dateTimeText(row.occurredAt, locale)}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className={styles.blockSection}>
                      <h3 className={styles.sectionTitle}>{dict.import.rejectionsTitle}</h3>
                      {preview.rejections.length ? (
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th className={styles.th}>{dict.import.rowNumber}</th>
                              <th className={styles.th}>{dict.common.reason}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.rejections.map((row) => (
                              <tr key={row.row} className={styles.tr}>
                                <td className={styles.td}>{formatNumber(row.row, locale)}</td>
                                <td className={styles.td}>{row.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p className={styles.docNote}>{dict.import.noRejections}</p>
                      )}
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>

          <aside className={styles.sidePanel}>
            <Panel>
              <div className={styles.sideInner}>
                <h3 className={styles.sectionTitle}>{dict.import.preview}</h3>
                <p className={styles.docNote}>{dict.import.subtitle}</p>
                <Button variant="primary" block onClick={runCommit} disabled={!preview || busy !== null}>
                  {busy === "commit" ? dict.import.committing : dict.import.commit}
                </Button>
                {!preview ? <p className={styles.docNote}>{dict.import.previewFirst}</p> : null}
                {busy === "read" ? <p className={styles.docNote}>{dict.import.previewing}</p> : null}
                <p className={styles.docNote}>{dict.import.note}</p>
              </div>
            </Panel>
          </aside>
        </div>
      )}

      {!loading && !designedKind && !committed ? (
        <p className={styles.docNote}>
        <Link href={`/${locale}/inbox`} className={styles.filter}>
          {dict.import.goInbox}
        </Link>
        </p>
      ) : null}
      <Toast message={toast?.message ?? null} tone={toast?.tone} onClose={clear} />
    </div>
  );
}
