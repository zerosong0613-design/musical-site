// 세로로 긴 상세 이미지를 읽을 수 있는 크기의 조각으로 나눈다.
// 이미지 인식 API는 긴 변을 2048px 안으로 줄인 뒤 읽기 때문에, 통째로 보내면 캐스팅 표 글자가 뭉개진다.
// 조각 높이를 가로의 2배로 맞추면 API가 줄인 뒤에도 가로 768px 수준의 해상도가 유지된다.

// 자를 위치 계산. 경계에 걸린 행이 어느 한 조각에는 온전히 들어가도록 조각끼리 조금 겹친다.
export function slicePlan(width, height, { ratio = 2, overlap = 0.12, maxSlices = 24 } = {}) {
  const full = Math.round(width * ratio);
  if (height <= Math.round(width * (ratio + 0.2))) return [{ top: 0, height }];
  const step = Math.round(full * (1 - overlap));
  const plan = [];
  for (let top = 0; ; top += step) {
    if (top + full >= height) { plan.push({ top: height - full, height: full }); break; } // 마지막 조각은 바닥에 맞춘다
    plan.push({ top, height: full });
  }
  if (plan.length > maxSlices) throw new Error(`이미지가 너무 깁니다(${plan.length}조각, 상한 ${maxSlices})`);
  return plan;
}

// sharp 인스턴스를 받아 조각별 JPEG 바이트를 돌려준다. 자를 필요가 없으면 원본 그대로 한 장.
export async function sliceImage(bytes, sharp, contentType, options) {
  const { width, height } = await sharp(bytes, { limitInputPixels: false }).metadata();
  const plan = slicePlan(width, height, options);
  if (plan.length === 1) return [{ contentType, bytes }];
  return Promise.all(plan.map(async ({ top, height: h }) => ({
    contentType: 'image/jpeg',
    bytes: await sharp(bytes, { limitInputPixels: false }).extract({ left: 0, top, width, height: h }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer(),
  })));
}
