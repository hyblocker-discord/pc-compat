const methods: String[] = PCCompatNative.executeJS(`Object.keys(require("crypto"))`);

const crypto = {};
for(const key of methods) {
   // @ts-ignore
   crypto[key] = PCCompatNative.executeJS(`require("crypto").${key}`)
}

export default crypto;