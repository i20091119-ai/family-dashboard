// 화면 코드(src/client)를 public/app.js 하나로 묶습니다.
import { build } from 'esbuild';
await build({
  entryPoints: ['src/client/main.ts'], bundle: true, format: 'esm', target: 'es2020',
  outfile: 'public/app.js', minify: true, sourcemap: false, legalComments: 'none',
});
console.log('public/app.js 만들기 끝');
