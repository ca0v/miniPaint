export function dump(cropper) {
  console.log(`status: ${cropper.status}`);
  console.log(`data: ${cropper.data.map((d) => `${Math.floor(d.x)},${Math.floor(d.y)}`)}`);
}
