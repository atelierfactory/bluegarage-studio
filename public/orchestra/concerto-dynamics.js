// 結んだ長い音の途中のcresc.も、記号の拍まで待ってから始める。
export function noteDynamicAt(n,beat){let v=n.v;const p=n.dynCurve??[];for(let i=0;i<p.length;i++){if(beat<p[i].b){if(!i)return v;const a=p[i-1],b=p[i];return a.v+(b.v-a.v)*(beat-a.b)/Math.max(1e-9,b.b-a.b);}v=p[i].v;}return v;}
export function expressionAt(points,sec){let value=1;for(let i=0;i<points.length;i++){const p=points[i];if(sec<p.at){if(!i)return value;const a=points[i-1];return a.ratio+(p.ratio-a.ratio)*(sec-a.at)/Math.max(1e-9,p.at-a.at);}value=p.ratio;}return value;}
