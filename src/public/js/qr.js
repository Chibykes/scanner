class e {
    static hasCamera() {
        return navigator.mediaDevices ? navigator.mediaDevices.enumerateDevices().then(a=>a.some(a=>"videoinput" === a.kind)).catch(()=>!1) : Promise.resolve(!1)
    }
    constructor(a, b, c=this._onDecodeError, d=this._calculateScanRegion, f="environment") {
        this.$video = a;
        this.$canvas = document.createElement("canvas");
        this._onDecode = b;
        this._legacyCanvasSize = e.DEFAULT_CANVAS_SIZE;
        this._preferredFacingMode = f;
        this._flashOn = this._paused = this._active = !1;
        "number" === typeof c ? (this._legacyCanvasSize = c,
        console.warn("You're using a deprecated version of the QrScanner constructor which will be removed in the future")) : this._onDecodeError = c;
        "number" === typeof d ? (this._legacyCanvasSize = d,
        console.warn("You're using a deprecated version of the QrScanner constructor which will be removed in the future")) : this._calculateScanRegion = d;
        this._scanRegion = this._calculateScanRegion(a);
        this._onPlay = this._onPlay.bind(this);
        this._onLoadedMetaData = this._onLoadedMetaData.bind(this);
        this._onVisibilityChange = this._onVisibilityChange.bind(this);
        this.$video.playsInline = !0;
        this.$video.muted = !0;
        this.$video.disablePictureInPicture = !0;
        this.$video.addEventListener("play", this._onPlay);
        this.$video.addEventListener("loadedmetadata", this._onLoadedMetaData);
        document.addEventListener("visibilitychange", this._onVisibilityChange);
        this._qrEnginePromise = e.createQrEngine()
    }
    hasFlash() {
        if (!("ImageCapture"in window))
            return Promise.resolve(!1);
        let a = this.$video.srcObject ? this.$video.srcObject.getVideoTracks()[0] : null;
        return a ? (new ImageCapture(a)).getPhotoCapabilities().then(a=>a.fillLightMode.includes("flash")).catch(a=>{
            console.warn(a);
            return !1
        }
        ) : Promise.reject("Camera not started or not available")
    }
    isFlashOn() {
        return this._flashOn
    }
    toggleFlash() {
        return this._setFlash(!this._flashOn)
    }
    turnFlashOff() {
        return this._setFlash(!1)
    }
    turnFlashOn() {
        return this._setFlash(!0)
    }
    destroy() {
        this.$video.removeEventListener("loadedmetadata", this._onLoadedMetaData);
        this.$video.removeEventListener("play", this._onPlay);
        document.removeEventListener("visibilitychange", this._onVisibilityChange);
        this.stop();
        e._postWorkerMessage(this._qrEnginePromise, "close")
    }
    start() {
        if (this._active && !this._paused)
            return Promise.resolve();
        this._active = !0;
        this._paused = !1;
        if (document.hidden)
            return Promise.resolve();
        clearTimeout(this._offTimeout);
        this._offTimeout = null;
        if (this.$video.srcObject)
            return this.$video.play(),
            Promise.resolve();
        let a = this._preferredFacingMode;
        return this._getCameraStream(a, !0).catch(()=>{
            a = "environment" === a ? "user" : "environment";
            return this._getCameraStream()
        }
        ).then(b=>{
            a = this._getFacingMode(b) || a;
            this.$video.srcObject = b;
            this.$video.play();
            this._setVideoMirror(a)
        }
        )
    }
    stop() {
        this.pause();
        this._active = !1
    }
    pause() {
        this._paused = !0;
        this._active && (this.$video.pause(),
        this._offTimeout || (this._offTimeout = setTimeout(()=>{
            let a = this.$video.srcObject ? this.$video.srcObject.getTracks() : [];
            for (let b of a)
                b.stop();
            this._offTimeout = this.$video.srcObject = null
        }
        , 300)))
    }
    static scanImage(a, b=null, c=null, d=null, f=!1, k=!1) {
        let h = c instanceof Worker
          , g = Promise.all([c || e.createQrEngine(), e._loadImage(a)]).then(([a,g])=>{
            c = a;
            let k;
            [d,k] = this._drawToCanvas(g, b, d, f);
            return c instanceof Worker ? (h || c.postMessage({
                type: "inversionMode",
                data: "both"
            }),
            new Promise((a,b)=>{
                let f, l, g;
                l = d=>{
                    "qrResult" === d.data.type && (c.removeEventListener("message", l),
                    c.removeEventListener("error", g),
                    clearTimeout(f),
                    null !== d.data.data ? a(d.data.data) : b(e.NO_QR_CODE_FOUND))
                }
                ;
                g = a=>{
                    c.removeEventListener("message", l);
                    c.removeEventListener("error", g);
                    clearTimeout(f);
                    b("Scanner error: " + (a ? a.message || a : "Unknown Error"))
                }
                ;
                c.addEventListener("message", l);
                c.addEventListener("error", g);
                f = setTimeout(()=>g("timeout"), 1E4);
                let h = k.getImageData(0, 0, d.width, d.height);
                c.postMessage({
                    type: "decode",
                    data: h
                }, [h.data.buffer])
            }
            )) : new Promise((a,b)=>{
                let f = setTimeout(()=>b("Scanner error: timeout"), 1E4);
                c.detect(d).then(c=>{
                    c.length ? a(c[0].rawValue) : b(e.NO_QR_CODE_FOUND)
                }
                ).catch(a=>b("Scanner error: " + (a.message || a))).finally(()=>clearTimeout(f))
            }
            )
        }
        );
        b && k && (g = g.catch(()=>e.scanImage(a, null, c, d, f)));
        return g = g.finally(()=>{
            h || e._postWorkerMessage(c, "close")
        }
        )
    }
    setGrayscaleWeights(a, b, c, d=!0) {
        e._postWorkerMessage(this._qrEnginePromise, "grayscaleWeights", {
            red: a,
            green: b,
            blue: c,
            useIntegerApproximation: d
        })
    }
    setInversionMode(a) {
        e._postWorkerMessage(this._qrEnginePromise, "inversionMode", a)
    }
    static createQrEngine(a=e.WORKER_PATH) {
        return ("BarcodeDetector"in window ? BarcodeDetector.getSupportedFormats() : Promise.resolve([])).then(b=>-1 !== b.indexOf("qr_code") ? new BarcodeDetector({
            formats: ["qr_code"]
        }) : new Worker(a))
    }
    _onPlay() {
        this._scanRegion = this._calculateScanRegion(this.$video);
        this._scanFrame()
    }
    _onLoadedMetaData() {
        this._scanRegion = this._calculateScanRegion(this.$video)
    }
    _onVisibilityChange() {
        document.hidden ? this.pause() : this._active && this.start()
    }
    _calculateScanRegion(a) {
        let b = Math.round(2 / 3 * Math.min(a.videoWidth, a.videoHeight));
        return {
            x: (a.videoWidth - b) / 2,
            y: (a.videoHeight - b) / 2,
            width: b,
            height: b,
            downScaledWidth: this._legacyCanvasSize,
            downScaledHeight: this._legacyCanvasSize
        }
    }
    _scanFrame() {
        if (!this._active || this.$video.paused || this.$video.ended)
            return !1;
        requestAnimationFrame(()=>{
            1 >= this.$video.readyState ? this._scanFrame() : this._qrEnginePromise.then(a=>e.scanImage(this.$video, this._scanRegion, a, this.$canvas)).then(this._onDecode, a=>{
                this._active && (-1 !== (a.message || a).indexOf("service unavailable") && (this._qrEnginePromise = e.createQrEngine()),
                this._onDecodeError(a))
            }
            ).then(()=>this._scanFrame())
        }
        )
    }
    _onDecodeError(a) {
        a !== e.NO_QR_CODE_FOUND && console.log(a)
    }
    _getCameraStream(a, b=!1) {
        let c = [{
            width: {
                min: 1024
            }
        }, {
            width: {
                min: 768
            }
        }, {}];
        a && (b && (a = {
            exact: a
        }),
        c.forEach(b=>b.facingMode = a));
        return this._getMatchingCameraStream(c)
    }
    _getMatchingCameraStream(a) {
        return navigator.mediaDevices && 0 !== a.length ? navigator.mediaDevices.getUserMedia({
            video: a.shift()
        }).catch(()=>this._getMatchingCameraStream(a)) : Promise.reject("Camera not found.")
    }
    _setFlash(a) {
        return this.hasFlash().then(b=>b ? this.$video.srcObject.getVideoTracks()[0].applyConstraints({
            advanced: [{
                torch: a
            }]
        }) : Promise.reject("No flash available")).then(()=>this._flashOn = a)
    }
    _setVideoMirror(a) {
        this.$video.style.transform = "scaleX(" + ("user" === a ? -1 : 1) + ")"
    }
    _getFacingMode(a) {
        return (a = a.getVideoTracks()[0]) ? /rear|back|environment/i.test(a.label) ? "environment" : /front|user|face/i.test(a.label) ? "user" : null : null
    }
    static _drawToCanvas(a, b=null, c=null, d=!1) {
        c = c || document.createElement("canvas");
        let f = b && b.x ? b.x : 0
          , k = b && b.y ? b.y : 0
          , h = b && b.width ? b.width : a.width || a.videoWidth
          , g = b && b.height ? b.height : a.height || a.videoHeight;
        d || (c.width = b && b.downScaledWidth ? b.downScaledWidth : h,
        c.height = b && b.downScaledHeight ? b.downScaledHeight : g);
        b = c.getContext("2d", {
            alpha: !1
        });
        b.imageSmoothingEnabled = !1;
        b.drawImage(a, f, k, h, g, 0, 0, c.width, c.height);
        return [c, b]
    }
    static _loadImage(a) {
        if (a instanceof HTMLCanvasElement || a instanceof HTMLVideoElement || window.ImageBitmap && a instanceof window.ImageBitmap || window.OffscreenCanvas && a instanceof window.OffscreenCanvas)
            return Promise.resolve(a);
        if (a instanceof Image)
            return e._awaitImageLoad(a).then(()=>a);
        if (a instanceof File || a instanceof Blob || a instanceof URL || "string" === typeof a) {
            let b = new Image;
            b.src = a instanceof File || a instanceof Blob ? URL.createObjectURL(a) : a;
            return e._awaitImageLoad(b).then(()=>{
                (a instanceof File || a instanceof Blob) && URL.revokeObjectURL(b.src);
                return b
            }
            )
        }
        return Promise.reject("Unsupported image type.")
    }
    static _awaitImageLoad(a) {
        return new Promise((b,c)=>{
            if (a.complete && 0 !== a.naturalWidth)
                b();
            else {
                let d, f;
                d = ()=>{
                    a.removeEventListener("load", d);
                    a.removeEventListener("error", f);
                    b()
                }
                ;
                f = ()=>{
                    a.removeEventListener("load", d);
                    a.removeEventListener("error", f);
                    c("Image load error")
                }
                ;
                a.addEventListener("load", d);
                a.addEventListener("error", f)
            }
        }
        )
    }
    static _postWorkerMessage(a, b, c) {
        return Promise.resolve(a).then(a=>{
            a instanceof Worker && a.postMessage({
                type: b,
                data: c
            })
        }
        )
    }
}
e.DEFAULT_CANVAS_SIZE = 400;
e.NO_QR_CODE_FOUND = "No QR code found";
e.WORKER_PATH = "qr-scanner-worker.min.js";
export default e
//# sourceMappingURL=qr-scanner.min.js.map
