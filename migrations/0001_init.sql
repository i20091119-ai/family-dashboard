-- 가족 대시보드 기록 저장소 (추가만 합니다. 지우기·덮어쓰기 금지)
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- 아침 출발 도우미: 누른 시각 (sim = 개발 메뉴 시험 기록)
CREATE TABLE IF NOT EXISTS morning_taps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, who TEXT NOT NULL, step TEXT NOT NULL,
  time TEXT NOT NULL, at TEXT NOT NULL, sim INTEGER NOT NULL DEFAULT 0,
  UNIQUE (date, who, step, sim)
);

-- 등교 시각 (알림 원문은 저장하지 않음). 하루 한 번, 처음 온 것만
CREATE TABLE IF NOT EXISTS arrivals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, time TEXT NOT NULL, source TEXT NOT NULL, sim INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, ok INTEGER, deadline TEXT, message TEXT,
  received_at TEXT NOT NULL, sent_at TEXT,
  UNIQUE (date, sim)
);

-- 우리 집 할 일 · 장보기
CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL, text TEXT NOT NULL, by TEXT NOT NULL, created_at TEXT NOT NULL,
  done_by TEXT, done_at TEXT, deleted INTEGER NOT NULL DEFAULT 0
);
