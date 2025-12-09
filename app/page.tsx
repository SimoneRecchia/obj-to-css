'use client';

import { useState, useCallback, useMemo } from 'react';
import { getRoundedCube } from './presets/cube';
import './style.css';

const presets: Record<string, string> = {
    diamante: `v 0 -50 0
v -30 0 -30
v 30 0 -30
v 30 0 30
v -30 0 30
v 0 50 0
f 1 2 3
f 1 3 4
f 1 4 5
f 1 5 2
f 6 3 2
f 6 4 3
f 6 5 4
f 6 2 5`,
    cubo: `v -30 -30 -30
v 30 -30 -30
v 30 30 -30
v -30 30 -30
v -30 -30 30
v 30 -30 30
v 30 30 30
v -30 30 30
f 1 2 3
f 1 3 4
f 6 5 8
f 6 8 7
f 4 3 7
f 4 7 8
f 5 6 2
f 5 2 1
f 2 6 7
f 2 7 3
f 5 1 4
f 5 4 8`,
    piramide: `v 0 -40 0
v -35 30 -35
v 35 30 -35
v 35 30 35
v -35 30 35
f 1 2 3
f 1 3 4
f 1 4 5
f 1 5 2
f 2 4 3
f 2 5 4`,
    icosaedro: `v 0 32 52
v 0 32 -52
v 0 -32 52
v 0 -32 -52
v 32 52 0
v 32 -52 0
v -32 52 0
v -32 -52 0
v 52 0 32
v -52 0 32
v 52 0 -32
v -52 0 -32
f 1 5 7
f 1 7 10
f 1 10 3
f 1 3 9
f 1 9 5
f 2 7 5
f 2 12 7
f 2 4 12
f 2 11 4
f 2 5 11
f 3 10 8
f 3 8 6
f 3 6 9
f 4 8 12
f 4 6 8
f 5 9 11
f 6 11 9
f 7 12 10
f 8 10 12
f 6 4 11`,
    casetta: `v -30 5 -20
v 30 5 -20
v 30 5 20
v -30 5 20
v -30 -30 -20
v 30 -30 -20
v 30 -30 20
v -30 -30 20
v 0 -50 -20
v 0 -50 20
f 1 2 6
f 1 6 5
f 2 3 7
f 2 7 6
f 3 4 8
f 3 8 7
f 4 1 5
f 4 5 8
f 1 4 3
f 1 3 2
f 5 6 9
f 7 8 10
f 6 7 10
f 6 10 9
f 8 5 9
f 8 9 10`,
    'Rounded-Cube': getRoundedCube(),
};

interface ParsedModel {
    vertices: number[][];
    faces: number[][];
}

interface FaceData {
    pointsStr: string;
    depth: number;
    color: string;
    r: number;
    g: number;
    b: number;
    points: number[][];
}

type ExportTab = 'completo' | 'solo-svg' | 'dati';

function parseOBJ(objString: string): ParsedModel {
    const vertices: number[][] = [];
    const faces: number[][] = [];

    for (let line of objString.split('\n')) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;
        const parts = line.split(/\s+/);

        if (parts[0] === 'v') {
            vertices.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
        } else if (parts[0] === 'f') {
            const fv = parts.slice(1).map((p) => parseInt(p.split('/')[0]) - 1);
            if (fv.length === 3) faces.push(fv);
            else for (let i = 1; i < fv.length - 1; i++) faces.push([fv[0], fv[i], fv[i + 1]]);
        }
    }
    return { vertices, faces };
}

function normalizeVertices(vertices: number[][]): number[][] {
    if (!vertices.length) return vertices;

    let [minX, maxX, minY, maxY, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
    for (const v of vertices) {
        minX = Math.min(minX, v[0]); maxX = Math.max(maxX, v[0]);
        minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]);
        minZ = Math.min(minZ, v[2]); maxZ = Math.max(maxZ, v[2]);
    }

    const [cx, cy, cz] = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    if (!size) return vertices;

    return vertices.map((v) => [(v[0] - cx) / size * 2, (v[1] - cy) / size * 2, (v[2] - cz) / size * 2]);
}

const rotate = (p: number[], angle: number, axis: 'x' | 'y'): number[] => {
    const r = (angle * Math.PI) / 180;
    const [c, s] = [Math.cos(r), Math.sin(r)];
    return axis === 'y'
        ? [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]
        : [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
};

const vec3 = {
    centroid: (a: number[], b: number[], c: number[]) =>
        [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
    normal: (a: number[], b: number[], c: number[]) => {
        const [e1, e2] = [[b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]];
        return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    },
    normalize: (v: number[]) => {
        const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
        return len ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, 0];
    },
};

export default function OBJRenderer() {
    const [objInput, setObjInput] = useState(presets.diamante);
    const [rotY, setRotY] = useState(30);
    const [rotX, setRotX] = useState(-20);
    const [zoom, setZoom] = useState(0.7);
    const [currentTab, setCurrentTab] = useState<ExportTab>('completo');
    const [copied, setCopied] = useState(false);

    const model = useMemo(() => {
        const parsed = parseOBJ(objInput);
        return { vertices: normalizeVertices(parsed.vertices), faces: parsed.faces };
    }, [objInput]);

    const renderedFaces = useMemo(() => {
        const { vertices, faces } = model;
        const [center, scale] = [250, 200 * zoom];

        const transformed = vertices.map((v) => rotate(rotate(v, rotY, 'y'), rotX, 'x'));

        return faces
            .map((face) => {
                const [v1, v2, v3] = [transformed[face[0]], transformed[face[1]], transformed[face[2]]];
                if (!v1 || !v2 || !v3) return null;

                const project = (p: number[]) => [center + p[0] * scale, center + p[1] * scale];
                const [p1, p2, p3] = [project(v1), project(v2), project(v3)];
                const brightness = Math.max(0.2, Math.min(1.0, vec3.normalize(vec3.normal(v1, v2, v3))[2]));
                const [r, g, b] = [Math.floor(52 + brightness * 100), Math.floor(120 + brightness * 100), Math.floor(180 + brightness * 40)];

                return {
                    points: [p1, p2, p3],
                    pointsStr: [p1, p2, p3].map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' '),
                    depth: vec3.centroid(v1, v2, v3)[2],
                    color: `rgb(${r},${g},${b})`,
                    r, g, b,
                };
            })
            .filter((f): f is FaceData => f !== null)
            .sort((a, b) => a.depth - b.depth);
    }, [model, rotY, rotX, zoom]);

    const generateSVGContent = useCallback(
        () => renderedFaces.map((f) => `            <polygon class="face" points="${f.pointsStr}" fill="${f.color}"/>`).join('\n'),
        [renderedFaces]
    );

    const exportCode = useMemo(() => {
        if (currentTab === 'completo') {
            return `<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Forma 3D</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { min-height: 100vh; display: flex; justify-content: center; align-items: center; background: #1a1a2e; }
        .shape-container { width: 500px; height: 500px; }
        .shape-container svg { width: 100%; height: 100%; }
        .face { stroke: rgba(255, 255, 255, 0.15); stroke-width: 0.5; }
    </style>
</head>
<body>
    <div class="shape-container">
        <svg viewBox="0 0 500 500">
${generateSVGContent()}
        </svg>
    </div>
</body>
</html>`;
        }
        if (currentTab === 'solo-svg') {
            return `<svg viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">\n${generateSVGContent()}\n</svg>`;
        }
        return JSON.stringify({
            info: 'Dati della forma 3D renderizzata',
            viewBox: '0 0 500 500',
            facesCount: renderedFaces.length,
            faces: renderedFaces.map((f, i) => ({
                index: i,
                points: f.points.map((p) => ({ x: +p[0].toFixed(1), y: +p[1].toFixed(1) })),
                color: { r: f.r, g: f.g, b: f.b },
                depth: +f.depth.toFixed(3),
            })),
        }, null, 2);
    }, [currentTab, renderedFaces, generateSVGContent]);

    const copyCode = useCallback(async () => {
        await navigator.clipboard.writeText(exportCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [exportCode]);

    const controls = [
        { label: 'Rotazione Y', value: rotY, unit: '°', min: 0, max: 360, set: setRotY },
        { label: 'Rotazione X', value: rotX, unit: '°', min: -90, max: 90, set: setRotX },
        { label: 'Zoom', value: zoom, unit: 'x', min: 0.5, max: 2, step: 0.1, set: setZoom },
    ];

    const tabs: { id: ExportTab; label: string }[] = [
        { id: 'completo', label: 'HTML' },
        { id: 'solo-svg', label: 'SVG' },
        { id: 'dati', label: 'JSON' },
    ];

    return (
        <div className="obj-app">
            {/* Header */}
            <header className="obj-header">
                <div className="obj-header-left">
                    <h1 className="obj-title">OBJ to SVG</h1>
                    <span className="obj-subtitle">3D Model Visualizer</span>
                </div>
                <div className="obj-stats-inline">
                    <span><strong>{model.vertices.length}</strong> vertici</span>
                    <span><strong>{model.faces.length}</strong> facce</span>
                </div>
            </header>

            {/* Main Content */}
            <main className="obj-content">
                {/* Left Panel - Input & Controls */}
                <aside className="obj-panel obj-panel-left">
                    <div className="obj-panel-section">
                        <h3 className="obj-section-title">Preset</h3>
                        <div className="obj-preset-grid">
                            {Object.keys(presets).map((name) => (
                                <button key={name} onClick={() => setObjInput(presets[name])} className="obj-btn-preset">
                                    {name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="obj-panel-section">
                        <h3 className="obj-section-title">OBJ Input</h3>
                        <textarea
                            value={objInput}
                            onChange={(e) => setObjInput(e.target.value)}
                            placeholder="Incolla qui il tuo OBJ..."
                            className="obj-textarea"
                        />
                    </div>

                    <div className="obj-panel-section">
                        <h3 className="obj-section-title">Camera</h3>
                        {controls.map((c) => (
                            <div key={c.label} className="obj-control">
                                <div className="obj-control-header">
                                    <span>{c.label}</span>
                                    <span className="obj-control-value">{c.value}{c.unit}</span>
                                </div>
                                <input
                                    type="range"
                                    min={c.min}
                                    max={c.max}
                                    step={c.step || 1}
                                    value={c.value}
                                    onChange={(e) => c.set(Number(e.target.value))}
                                    className="obj-range"
                                />
                            </div>
                        ))}
                    </div>
                </aside>

                {/* Center - 3D Preview */}
                <section className="obj-viewport">
                    <div className="obj-svg-container">
                        <svg viewBox="0 0 500 500">
                            {renderedFaces.map((f, i) => (
                                <polygon key={i} points={f.pointsStr} fill={f.color} stroke="rgba(255,255,255,0.15)" strokeWidth="0.5" />
                            ))}
                        </svg>
                    </div>
                </section>

                {/* Right Panel - Export */}
                <aside className="obj-panel obj-panel-right">
                    <div className="obj-panel-section obj-export-section">
                        <div className="obj-tabs">
                            {tabs.map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setCurrentTab(t.id)}
                                    className={`obj-btn-tab ${currentTab === t.id ? 'active' : ''}`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <textarea value={exportCode} readOnly className="obj-export-code" />
                        <button onClick={copyCode} className={`obj-btn-copy ${copied ? 'copied' : ''}`}>
                            {copied ? '✓ Copiato!' : 'Copia codice'}
                        </button>
                    </div>
                </aside>
            </main>
        </div>
    );
}