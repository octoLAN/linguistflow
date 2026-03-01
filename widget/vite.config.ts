import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    build: {
        // Write out directly to dist without a hash in the filename 
        // so customers always use "widget.js"
        lib: {
            entry: resolve(__dirname, 'src/main.ts'),
            name: 'LinguistFlowWidget',
            fileName: () => 'widget.js',
            formats: ['iife'] // Immediately Invoked Function Expression for native browser injection
        },
        // We don't want to output an external CSS file because we need the CSS 
        // to be injected dynamically inside the Shadow DOM!
        cssCodeSplit: false,
        emptyOutDir: true,
    }
});
