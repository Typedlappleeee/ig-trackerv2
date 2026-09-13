// piexifjs n'a pas de types officiels — déclaration minimale de ce qu'on utilise.
declare module 'piexifjs' {
  interface GPSHelper {
    degToDmsRational(deg: number): [number, number][]
    dmsRationalToDeg(dms: [number, number][], ref: string): number
  }
  interface Piexif {
    dump(exif: unknown): string
    insert(exif: string, jpegData: string): string
    load(jpegData: string): unknown
    remove(jpegData: string): string
    ImageIFD: Record<string, number>
    ExifIFD: Record<string, number>
    GPSIFD: Record<string, number>
    GPSHelper: GPSHelper
    TAGS: unknown
    version: string
  }
  const piexif: Piexif
  export default piexif
}
