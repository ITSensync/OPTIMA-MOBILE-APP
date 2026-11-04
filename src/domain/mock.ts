/** Generator EPC palsu untuk mode simulasi (tanpa hardware). */
export function randomEpc(): string {
  let out = '';
  for (let i = 0; i < 24; i += 1) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out.toUpperCase();
}
