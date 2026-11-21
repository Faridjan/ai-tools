const d = BZ.dump('dump_draw.json');
log('n', d.count, 'bounds', JSON.stringify(d.panelsBounds));
log('sections', JSON.stringify(BZ.sections().map(s => [s.zone, s.x0, s.x1, s.y0, s.y1, s.shelves])));
