// Original 32px NEXLOS menu artwork. Unlike the small toolbar icons these use
// a full 32px drawing grid, so menu details are not enlarged 16px blocks.
const r=(x,y,w,z,c)=>`<rect x="${x}" y="${y}" width="${w}" height="${z}" fill="${c}"/>`;
const p=(points,c)=>`<polygon points="${points}" fill="${c}"/>`;
const paper=r(11,2,14,23,'#161616')+r(12,3,12,21,'#fff')+r(15,8,7,1,'#808080')+r(15,11,7,1,'#808080')+r(15,14,7,1,'#808080');
const folderBack=p('2,10 3,6 12,6 15,9 27,9 29,12 27,27 2,27','#161616')+p('3,11 4,7 12,7 15,10 27,10 27,25 3,25','#d8ad4a')+r(4,8,8,1,'#ffffbf');
const folderFront=p('1,14 27,14 30,12 27,28 3,28','#161616')+p('2,15 27,15 29,13 26,27 4,27','#ffe493')+r(4,16,21,1,'#fff6cf')+r(4,26,22,1,'#c49135');
const windowIcon=r(10,2,20,18,'#161616')+r(11,3,18,16,'#c0c0c0')+r(12,4,16,3,'#000080')+r(25,5,2,1,'#fff')+r(12,8,16,10,'#fff')+r(14,10,5,6,'#0878b8')+r(21,10,5,2,'#808080')+r(21,14,4,1,'#808080');
const magnify=p('15,4 23,4 28,9 28,17 23,22 15,22 10,17 10,9','#161616')+p('15,6 23,6 26,10 26,16 22,20 16,20 12,16 12,10','#808080')+p('16,7 22,7 25,10 25,16 22,19 16,19 13,16 13,10','#c5eff2')+r(15,9,5,2,'#fff')+p('10,20 14,24 7,31 3,27','#161616')+p('10,22 12,24 7,29 5,27','#986636');
const gear=p('20,7 24,7 24,11 27,12 30,10 32,14 29,17 29,20 32,22 30,26 26,25 24,27 24,31 20,31 19,27 16,25 12,27 10,23 13,20 13,17 10,14 12,10 16,12 19,11','#161616')+p('21,9 23,9 23,13 27,14 30,12 30,14 27,17 27,21 30,23 29,24 25,23 22,26 22,29 21,29 20,25 16,23 13,25 12,23 15,20 15,16 12,14 13,12 17,14 21,12','#b0b0b0')+r(18,16,7,7,'#161616')+r(19,17,5,5,'#fff')+r(20,18,4,4,'#808080');
const monitor=r(2,3,24,20,'#161616')+r(3,4,22,18,'#ddd')+r(5,6,18,13,'#404040')+r(6,7,16,11,'#008080')+r(7,8,12,1,'#90c8cf')+r(8,19,14,1,'#808080')+r(11,23,6,3,'#808080')+r(7,26,15,2,'#161616')+r(8,26,13,1,'#ddd');
const glyphs={
 programs:folderBack+windowIcon+folderFront,
 documents:folderBack+paper+folderFront,
 settings:folderBack+folderFront+gear,
 search:folderBack+folderFront+magnify,
 help:p('8,3 12,1 27,2 27,27 22,30 7,28','#161616')+p('9,4 13,3 25,4 25,26 21,28 9,26','#000080')+r(10,5,2,20,'#0000c0')+p('13,3 25,4 23,5 12,4','#fff')+r(16,8,7,2,'#fff')+r(22,10,2,5,'#fff')+r(18,14,5,2,'#fff')+r(17,15,2,5,'#fff')+r(17,22,2,2,'#fff'),
 run:r(2,5,27,20,'#161616')+r(3,6,25,18,'#c0c0c0')+r(4,7,23,3,'#000080')+r(5,12,20,9,'#fff')+r(7,14,10,2,'#008080')+r(7,18,7,1,'#808080')+p('21,16 21,28 24,25 27,30 29,29 26,24 30,24','#161616')+p('22,18 22,25 24,23 28,23','#fff'),
 shutdown:monitor+p('21,15 30,15 30,19 25,19 25,30 21,30 21,19 17,19 17,15','#161616')+r(22,16,7,2,'#d42e22')+r(22,18,2,11,'#d42e22'),
};
export function classicStartIcon(name){
 const art=glyphs[name];if(!art)return null;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('width','32');svg.setAttribute('height','32');svg.setAttribute('aria-hidden','true');svg.setAttribute('shape-rendering','crispEdges');svg.innerHTML=art;return svg;
}
