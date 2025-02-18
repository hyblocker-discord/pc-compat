import Webpack from "@modules/webpack";
import {DiscordModules} from "../../modules";

export default function AsyncComponent({_provider, _fallback, ...props}) {
    const [Component, setComponent] = DiscordModules.React.useState(() => (_fallback ?? (() => null)));

    DiscordModules.React.useEffect(() => {
        _provider().then(comp => setComponent(() => comp));
    }, [_provider, _fallback]);
    
    return (
        <Component {...props} />
    );
};

export function from(promise: Promise<any>, fallback?: any) {
    const value = {resolved: false, component: null};

    promise.then((component) => {
        Object.assign(value, {component, resolved: true});
    });

    return props => {
        if (value.resolved) return React.createElement(value.component, props);

        return DiscordModules.React.createElement(AsyncComponent, {
            _provider: () => promise,
            _fallback: fallback,
            ...props
        });
    };
};
export const fromPromise = from; // Alias

export function fromDisplayName(displayName: string, fallback?: any) {
    return from(Webpack.findByDisplayName(displayName, {wait: true}), fallback);
};

Object.assign(AsyncComponent, {from, fromDisplayName});

// TODO: Add fromModule and fromModuleProp