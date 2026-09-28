// Text out of a study file, using only what macOS ships with.
//
//   extract-text <file>   →   {"pages": ["…", …], "ocr": [false, true, …]}
//
// PDFs read their text layer page by page; a page with next to no text is
// a scan, so it is rendered and read with Vision's OCR instead. Photos of
// papers (jpg, png, heic) go straight to OCR, and Word files through
// AppKit's own reader. Nothing here installs anything or leaves the Mac:
// PDFKit, Vision and AppKit are part of the OS, and the Swift compiler
// comes with the Command Line Tools.
//
// scripts/sync-study-folder.mjs compiles this once into
// ~/Library/Caches/AcadKit/ and calls the binary per file.

import AppKit
import Foundation
import PDFKit
import Vision

/// Below this many non-space characters a PDF page is treated as a scan.
let scanThreshold = 30

func recognise(_ image: CGImage) -> String {
  let request = VNRecognizeTextRequest()
  request.recognitionLevel = .accurate
  request.usesLanguageCorrection = true
  let handler = VNImageRequestHandler(cgImage: image, options: [:])
  do { try handler.perform([request]) } catch { return "" }
  let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
  return lines.joined(separator: "\n")
}

/// A PDF page as a bitmap, at roughly 200 dpi — enough for Vision to read
/// exam-paper print without turning a 30-page scan into a memory problem.
func render(_ page: PDFPage) -> CGImage? {
  let bounds = page.bounds(for: .mediaBox)
  let scale: CGFloat = 200.0 / 72.0
  let width = Int(bounds.width * scale), height = Int(bounds.height * scale)
  guard width > 0, height > 0,
    let ctx = CGContext(
      data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
  else { return nil }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
  ctx.scaleBy(x: scale, y: scale)
  page.draw(with: .mediaBox, to: ctx)
  return ctx.makeImage()
}

func nonSpace(_ s: String) -> Int { s.unicodeScalars.filter { !CharacterSet.whitespacesAndNewlines.contains($0) }.count }

func emit(_ pages: [String], _ ocr: [Bool]) {
  let data = try! JSONSerialization.data(withJSONObject: ["pages": pages, "ocr": ocr])
  FileHandle.standardOutput.write(data)
}

let args = CommandLine.arguments
guard args.count == 2 else {
  FileHandle.standardError.write("usage: extract-text <file>\n".data(using: .utf8)!)
  exit(2)
}
let url = URL(fileURLWithPath: args[1])
let ext = url.pathExtension.lowercased()

switch ext {
case "pdf":
  guard let doc = PDFDocument(url: url) else { emit([], []); exit(0) }
  var pages: [String] = [], ocr: [Bool] = []
  for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { pages.append(""); ocr.append(false); continue }
    let text = page.string ?? ""
    if nonSpace(text) >= scanThreshold {
      pages.append(text); ocr.append(false)
    } else if let image = render(page) {
      pages.append(recognise(image)); ocr.append(true)
    } else {
      pages.append(text); ocr.append(false)
    }
  }
  emit(pages, ocr)
case "jpg", "jpeg", "png", "heic", "tif", "tiff":
  guard let image = NSImage(contentsOf: url),
    let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
  else { emit([], []); exit(0) }
  emit([recognise(cg)], [true])
case "docx", "doc", "rtf":
  let text = (try? NSAttributedString(url: url, options: [:], documentAttributes: nil))?.string ?? ""
  emit([text], [false])
default:
  emit([], [])
}
