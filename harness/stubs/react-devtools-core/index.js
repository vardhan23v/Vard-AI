// Ink imports this for React DevTools support, which vard does not use.
const devtools = { initialize() {}, connectToDevTools() {} };
export default devtools;
export const initialize = devtools.initialize;
export const connectToDevTools = devtools.connectToDevTools;
