const template = require('./template');

const main = async () => {
    const asset = 'DOGE';
    const spot = [];
    const perp = [];
    const markets = [];
    console.log(Object.keys(template))
    template.version = "1.0.0"
    template.name = `Rife${asset.toUpperCase()}`;
    template.id = `Rife${asset.toUpperCase()}${Date.now()}`
    return template;
}

main();