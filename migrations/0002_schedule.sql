-- 가족 일정 (직접 적기. 네이버 캘린더는 다음 단계에서 같은 카드에 더함). 추가만
CREATE TABLE IF NOT EXISTS schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, time TEXT, text TEXT NOT NULL, who TEXT NOT NULL,
  by TEXT NOT NULL, created_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS schedule_date ON schedule (date);
