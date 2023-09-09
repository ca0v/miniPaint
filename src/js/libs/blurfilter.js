function stackBlur(srcImageData, radius) {
    const targetContext = document.createElement('canvas').getContext('2d');
    // copy original image using a blur filter
    targetContext.canvas.width = srcImageData.width;
    targetContext.canvas.height = srcImageData.height;
    targetContext.putImageData(srcImageData, 0, 0);
    // apply the blur filter
    targetContext.filter = `blur(${radius}px)`;
    targetContext.drawImage(targetContext.canvas, 0, 0);

    // return blurred image data
    const result =targetContext.getImageData(0, 0, srcImageData.width, srcImageData.height);

    // restore pixels that were originally transparent
    const srcData = srcImageData.data;
    const dstData = result.data;
    for (let i = 0; i < srcData.length; i += 4) {
        if (srcData[i + 3] === 0) {
            dstData[i] = srcData[i];
            dstData[i + 1] = srcData[i + 1];
            dstData[i + 2] = srcData[i + 2];
            dstData[i + 3] = srcData[i + 3];
        }
    }
    return result;
}

export default stackBlur;
