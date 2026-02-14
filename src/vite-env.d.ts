/// <reference types="vite/client" />

declare module '*.module.css' {
    const classes: { [key: string]: string };
    export default classes;
}

interface Window {
    ipcRenderer: {
        send: (channel: string, ...args: any[]) => void;
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
        off: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
    };
}
