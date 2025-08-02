import { loadNativeClipperLibInstanceAsync, NativeClipperLibRequestedFormat } from 'js-angusj-clipper';

class ClipperProvider {
    private clipper?: any;
    private loadingPromise?: Promise<any>;

    async getClipper(): Promise<any> {
        if (this.clipper) {
            return this.clipper;
        }

        if (!this.loadingPromise) {
            this.loadingPromise = loadNativeClipperLibInstanceAsync(
                NativeClipperLibRequestedFormat.WasmWithAsmJsFallback
            ).then(clipper => {
                this.clipper = clipper;
                return clipper;
            }).catch(_ => {
                // Fallback to ASM.js only if WASM fails
                return loadNativeClipperLibInstanceAsync(
                    NativeClipperLibRequestedFormat.AsmJsOnly
                ).then(clipper => {
                    this.clipper = clipper;
                    return clipper;
                });
            });
        }

        return this.loadingPromise;
    }
}

export const clipperProvider = new ClipperProvider(); 