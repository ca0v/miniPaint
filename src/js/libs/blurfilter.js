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
            dstData[i] = 0;
            dstData[i + 1] = 0;
            dstData[i + 2] = 0;
            dstData[i + 3] = 0;
        }
    }
    return result;
}

export default stackBlur;
