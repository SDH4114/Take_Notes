// Test helper: build a Range over the raw body text content (across text nodes).
export function rangeForRaw(sub: string, nth = 0, root: Node = document.body): Range {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let full = '';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push(n as Text);
    full += (n as Text).data;
  }
  let from = -1;
  for (let i = 0; i <= nth; i++) {
    from = full.indexOf(sub, from + 1);
    if (from < 0) throw new Error(`"${sub}" #${nth} not found`);
  }
  const locate = (pos: number, end: boolean): [Text, number] => {
    let acc = 0;
    for (const n of nodes) {
      const len = n.data.length;
      if (pos < acc + len || (end && pos === acc + len)) return [n, pos - acc];
      acc += len;
    }
    throw new Error('out of range');
  };
  const r = document.createRange();
  const [sn, so] = locate(from, false);
  const [en, eo] = locate(from + sub.length, true);
  r.setStart(sn, so);
  r.setEnd(en, eo);
  return r;
}
