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
    return targetContext.getImageData(0, 0, srcImageData.width, srcImageData.height);
}

export default stackBlur;
