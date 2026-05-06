import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


class Notifier:
    def __init__(self):
        self.user     = os.getenv("SMTP_USER", "")
        self.password = os.getenv("SMTP_PASS", "")
        self.to_addr  = os.getenv("NOTIFY_EMAIL", "")
        self.host     = os.getenv("SMTP_HOST", "smtp.qq.com")
        self.port     = int(os.getenv("SMTP_PORT", "465"))
        self.enabled  = bool(self.user and self.password and self.to_addr)

    def notify_important(self, articles: list):
        if not self.enabled:
            return
        high = [a for a in articles if a.get("importance", 0) >= 8]
        if not high:
            return
        subject = f"【AI Daily】{len(high)} 条重要新闻"
        rows = "".join(self._article_row(a) for a in high)
        html = f"""<html><body style="font-family:-apple-system,sans-serif;max-width:680px;margin:auto;color:#1e293b;padding:20px">
          <h2 style="color:#3b82f6;border-bottom:2px solid #3b82f6;padding-bottom:8px;margin-bottom:16px">AI Daily — 重要新闻推送</h2>
          <p style="color:#64748b;margin-bottom:16px">本次抓取中，以下 <strong>{len(high)}</strong> 条新闻重要度 ≥ 8：</p>
          <table style="width:100%;border-collapse:collapse">{rows}</table>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px;border-top:1px solid #e2e8f0;padding-top:12px">— AI Daily 自动推送</p>
        </body></html>"""
        self._send(subject, html)

    @staticmethod
    def _article_row(a: dict) -> str:
        imp = a.get("importance", 5)
        source_url = a.get("source_url", "")
        title = a.get("title", "")
        title_html = (
            f'<a href="{source_url}" style="font-weight:bold;color:#1e293b;text-decoration:none">{title}</a>'
            if source_url else f'<span style="font-weight:bold">{title}</span>'
        )
        return f"""<tr><td style="padding:12px 0;border-bottom:1px solid #e2e8f0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <span style="background:#ef4444;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-weight:bold;flex-shrink:0">{imp}</span>
            {title_html}
          </div>
          <div style="color:#475569;font-size:13px;margin-bottom:4px">{a.get("summary", "")}</div>
          <div style="color:#94a3b8;font-size:12px">{a.get("source_name", "")} · {(a.get("published_at") or "")[:10]}</div>
        </td></tr>"""

    def _send(self, subject: str, html: str):
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = self.user
        msg["To"]      = self.to_addr
        msg.attach(MIMEText(html, "html", "utf-8"))
        ctx = ssl.create_default_context()
        try:
            with smtplib.SMTP_SSL(self.host, self.port, context=ctx) as server:
                server.login(self.user, self.password)
                server.sendmail(self.user, self.to_addr, msg.as_string())
            print(f"[Notifier] Email sent: {subject}")
        except Exception as e:
            print(f"[Notifier] Email failed: {e}")
