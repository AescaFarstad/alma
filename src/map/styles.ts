import { Style, Fill, Stroke } from 'ol/style';

export const buildingStyle = new Style({
    fill: new Fill({
        color: '#e3e3e3'
    }),
    stroke: new Stroke({
        color: 'rgba(0, 0, 0, 0.1)',
        width: 1
    })
});

export function getBuildingStyle(_feature: any, _resolution: number) {
    return buildingStyle;
}

export const roadStyle = new Style({
    stroke: new Stroke({
        color: '#aaaaaa',
        width: 2
    })
});

const footwayStyle = new Style({
    stroke: new Stroke({
        color: '#aaaaaa',
        width: 0.5,
        lineDash: [4, 4]
    })
});

const primarySecondaryStyle = new Style({
    stroke: new Stroke({
        color: '#aaaaaa',
        width: 4
    })
});

const serviceStyle = new Style({
    stroke: new Stroke({
        color: '#aaaaaa',
        width: 1
    })
});

export function getRoadStyle(feature: any, _resolution: number) {
    const highway = feature.get('highway');

    switch (highway) {
        case 'footway':
            return footwayStyle;
        case 'primary':
        case 'secondary':
            return primarySecondaryStyle;
        case 'service':
            return serviceStyle;
        default:
            return roadStyle;
    }
}
