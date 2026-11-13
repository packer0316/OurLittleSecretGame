// Normalised image coordinates, measured on children-1998.png. The SVG includes
// transparent margins: its dense ink centre falls over the rightmost girl's face.
export const PHOTO_MARK=Object.freeze({left:.75,top:.26,width:.21,height:.34});
export const PHOTO_MARK_STYLE=Object.entries(PHOTO_MARK).map(([key,n])=>`--photo-mark-${key}:${n*100}%`).join(';');

export function photoMarkLocal(width,height){
  return {x:(PHOTO_MARK.left+PHOTO_MARK.width/2-.5)*width,y:(.5-PHOTO_MARK.top-PHOTO_MARK.height/2)*height,width:width*PHOTO_MARK.width,height:height*PHOTO_MARK.height};
}
