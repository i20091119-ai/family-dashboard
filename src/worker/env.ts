export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  /** (선택) Cloudflare 에서 넣는 가족 접속 코드. 없으면 화면에서 처음 정한 코드(기록 저장소) */
  FAMILY_CODE?: string;
};
