import proj4 from 'proj4';
import { get as getProjection } from 'ol/proj.js';
import { register } from 'ol/proj/proj4.js';

proj4.defs(
  'EPSG:3059',
  '+proj=tmerc +lat_0=0 +lon_0=24 +k=0.9996 +x_0=500000 +y_0=-6000000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
);

register(proj4);
export const LKS92 = getProjection('EPSG:3059')!;
LKS92.setExtent([189423, 169355, 766600, 449394]);
