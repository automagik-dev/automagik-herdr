// ocrbox: print every text line Apple Vision reads in an image, with its box, as JSON.
//
//   swiftc -O -o ocrbox ocrbox.swift -framework Vision -framework AppKit
//   ./ocrbox shot.png
//   {"width":3456,"height":2040,"lines":[{"text":"…","x":12,"y":40,"w":200,"h":28,"confidence":1}]}
//
// Boxes are in image pixels, origin top left. Recognition is accurate, pt-BR then en-US.
import AppKit
import Foundation
import ImageIO
import Vision

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(("ocrbox: " + message + "\n").data(using: .utf8)!)
  exit(1)
}

guard CommandLine.arguments.count == 2 else { fail("usage: ocrbox <image.png>") }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
// ImageIO reads the full pixel size; NSImage could hand back a 72-dpi representation.
guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
  let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
else { fail("cannot read image \(url.path)") }

let width = Double(image.width)
let height = Double(image.height)
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["pt-BR", "en-US"]
request.usesLanguageCorrection = true
do {
  try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
} catch {
  fail("text recognition failed: \(error.localizedDescription)")
}

var lines: [[String: Any]] = []
for observation in request.results ?? [] {
  guard let best = observation.topCandidates(1).first else { continue }
  let box = observation.boundingBox  // normalised, origin bottom left
  lines.append([
    "text": best.string,
    "x": (box.minX * width).rounded(),
    "y": ((1 - box.maxY) * height).rounded(),
    "w": (box.width * width).rounded(),
    "h": (box.height * height).rounded(),
    "confidence": (Double(best.confidence) * 100).rounded() / 100,
  ])
}
let out: [String: Any] = ["width": Int(width), "height": Int(height), "lines": lines]
guard let data = try? JSONSerialization.data(withJSONObject: out, options: [.sortedKeys]) else {
  fail("cannot encode JSON")
}
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write("\n".data(using: .utf8)!)
