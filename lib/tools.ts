export const categories = [
  "All tools",
  "Organize PDF",
  "Optimize PDF",
  "Convert PDF",
  "Edit PDF",
  "PDF Security",
  "PDF Intelligence",
] as const;
export type Tool = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  color: string;
  accept?: string;
  multiple?: boolean;
  badge?: string;
  note?: string;
};
export const tools: Tool[] = [
  {
    id: "merge",
    name: "Merge PDF",
    description:
      "Bring your documents together. Combine PDFs in exactly the order you want.",
    category: "Organize PDF",
    icon: "Combine",
    color: "red",
    multiple: true,
  },
  {
    id: "split",
    name: "Split PDF",
    description:
      "One document, many possibilities. Separate pages or extract a custom range.",
    category: "Organize PDF",
    icon: "Scissors",
    color: "red",
  },
  {
    id: "compress",
    name: "Compress PDF",
    description:
      "Less size. Same great content. Optimize your PDF for easier sharing.",
    category: "Optimize PDF",
    icon: "Minimize2",
    color: "green",
  },
  {
    id: "pdf-word",
    name: "PDF to Word",
    description:
      "Turn your PDF into an editable Word document you can make your own.",
    category: "Convert PDF",
    icon: "FileType2",
    color: "blue",
    note: "Creates editable paragraphs and page images. Complex layouts may need adjustments.",
  },
  {
    id: "pdf-powerpoint",
    name: "PDF to PowerPoint",
    description:
      "Give your document a new stage. Turn PDF pages into presentation slides.",
    category: "Convert PDF",
    icon: "Presentation",
    color: "orange",
    note: "Each PDF page becomes a high-resolution slide image, preserving appearance.",
  },
  {
    id: "pdf-excel",
    name: "PDF to Excel",
    description:
      "Take your tables further. Extract PDF data into an Excel workbook.",
    category: "Convert PDF",
    icon: "Table2",
    color: "green",
  },
  {
    id: "word-pdf",
    name: "Word to PDF",
    description:
      "Make your Word documents ready to share with anyone, anywhere.",
    category: "Convert PDF",
    icon: "FileType2",
    color: "blue",
    accept: ".doc,.docx",
    note: "LibreOffice preserves Office layout. Without it, DOCX uses a content-based conversion.",
  },
  {
    id: "powerpoint-pdf",
    name: "PowerPoint to PDF",
    description:
      "Convert your presentation into an easy-to-share PDF document.",
    category: "Convert PDF",
    icon: "Presentation",
    color: "orange",
    accept: ".ppt,.pptx",
    note: "LibreOffice preserves slide layout. Without it, PPTX uses a content-based conversion.",
  },
  {
    id: "excel-pdf",
    name: "Excel to PDF",
    description: "Turn your spreadsheets and tables into clean PDF documents.",
    category: "Convert PDF",
    icon: "Table2",
    color: "green",
    accept: ".xls,.xlsx",
    note: "LibreOffice preserves print layouts. Without it, XLSX tables are reflowed.",
  },
  {
    id: "edit",
    name: "Edit PDF",
    description:
      "Make it yours. Add text, images, shapes, and annotations to your pages.",
    category: "Edit PDF",
    icon: "PencilLine",
    color: "purple",
  },
  {
    id: "pdf-jpg",
    name: "PDF to JPG",
    description:
      "Save every page as an image, or extract the images inside your PDF.",
    category: "Convert PDF",
    icon: "Images",
    color: "yellow",
  },
  {
    id: "jpg-pdf",
    name: "JPG to PDF",
    description:
      "Give your images a home. Combine JPG and PNG files into one PDF.",
    category: "Convert PDF",
    icon: "ImagePlus",
    color: "yellow",
    accept: "image/jpeg,image/png,image/webp",
    multiple: true,
  },
  {
    id: "sign",
    name: "Sign PDF",
    description:
      "Add your personal signature and finish your document in seconds.",
    category: "PDF Security",
    icon: "Signature",
    color: "purple",
    note: "Adds a visual signature. This is not a certificate-based digital signature or remote signing service.",
  },
  {
    id: "watermark",
    name: "Watermark",
    description: "Leave your mark. Add a custom text stamp to your PDF pages.",
    category: "Edit PDF",
    icon: "Stamp",
    color: "purple",
  },
  {
    id: "rotate",
    name: "Rotate PDF",
    description:
      "Get a fresh perspective. Rotate pages to just the right orientation.",
    category: "Edit PDF",
    icon: "RotateCw",
    color: "purple",
  },
  {
    id: "html-pdf",
    name: "HTML to PDF",
    description:
      "Turn your HTML content into a document that is ready to share.",
    category: "Convert PDF",
    icon: "Code2",
    color: "blue",
    accept: ".html,.htm",
    note: "Upload an HTML file or paste markup. Local scripts and remote resources are disabled.",
  },
  {
    id: "unlock",
    name: "Unlock PDF",
    description:
      "Open up your document. Remove password protection with its password.",
    category: "PDF Security",
    icon: "LockOpen",
    color: "blue",
  },
  {
    id: "protect",
    name: "Protect PDF",
    description: "Keep your documents private with strong password encryption.",
    category: "PDF Security",
    icon: "ShieldCheck",
    color: "blue",
  },
  {
    id: "organize",
    name: "Organize PDF",
    description:
      "A little order goes a long way. Rearrange and remove PDF pages.",
    category: "Organize PDF",
    icon: "LayoutGrid",
    color: "red",
  },
  {
    id: "pdfa",
    name: "PDF to PDF/A",
    description:
      "Prepare your documents for long-term archiving in PDF/A format.",
    category: "Convert PDF",
    icon: "Archive",
    color: "blue",
    note: "Requires Ghostscript with an ICC color profile. Validate archival conformance with veraPDF.",
  },
  {
    id: "repair",
    name: "Repair PDF",
    description:
      "Give a damaged document a second chance. Recover readable PDF data.",
    category: "Optimize PDF",
    icon: "Wrench",
    color: "green",
    note: "Recovery depends on the damage; content that is missing cannot be reconstructed.",
  },
  {
    id: "page-numbers",
    name: "Page numbers",
    description:
      "Keep everyone on the same page. Add customizable page numbers.",
    category: "Edit PDF",
    icon: "ListOrdered",
    color: "purple",
  },
  {
    id: "scan",
    name: "Scan to PDF",
    description:
      "From paper to digital. Capture or upload photos and create a PDF.",
    category: "Organize PDF",
    icon: "ScanLine",
    color: "red",
    accept: "image/*",
    multiple: true,
  },
  {
    id: "ocr",
    name: "OCR PDF",
    description:
      "Make scanned documents searchable with optical character recognition.",
    category: "Optimize PDF",
    icon: "ScanText",
    color: "green",
    note: "English OCR is included. Other languages require matching Tesseract language data.",
  },
  {
    id: "compare",
    name: "Compare PDF",
    description:
      "See what changed. Compare text between two document versions.",
    category: "PDF Security",
    icon: "Columns2",
    color: "blue",
    multiple: true,
    note: "Produces a page-by-page text difference report. Visual-only changes are not detected.",
  },
  {
    id: "redact",
    name: "Redact PDF",
    description:
      "Remove sensitive text permanently before you share your document.",
    category: "PDF Security",
    icon: "Eraser",
    color: "blue",
    note: "Matching text is permanently removed. Review every page before sharing; OCR scanned text first.",
  },
  {
    id: "crop",
    name: "Crop PDF",
    description:
      "Focus on what matters. Trim the margins around your PDF pages.",
    category: "Edit PDF",
    icon: "Crop",
    color: "purple",
  },
  {
    id: "forms",
    name: "PDF Forms",
    description:
      "Fill existing form fields or add new interactive fields to your document.",
    category: "Edit PDF",
    icon: "TextCursorInput",
    color: "purple",
    badge: "NEW",
  },
  {
    id: "summarize",
    name: "Summarize PDF",
    description:
      "Find the key points faster with a concise, extractive document summary.",
    category: "PDF Intelligence",
    icon: "Sparkles",
    color: "pink",
    badge: "NEW",
    note: "Runs a local sentence-ranking summarizer. No generative AI service is connected.",
  },
  {
    id: "translate",
    name: "Translate PDF",
    description:
      "Bring your document to a new audience. Translate its text into another language.",
    category: "PDF Intelligence",
    icon: "Languages",
    color: "pink",
    badge: "NEW",
    note: "Requires a configured LibreTranslate service. Output is reflowed text, not the original layout.",
  },
  {
    id: "markdown",
    name: "PDF to Markdown",
    description:
      "Move your content into notes, documentation, and your next big idea.",
    category: "PDF Intelligence",
    icon: "FileCode2",
    color: "pink",
    badge: "NEW",
  },
  {
    id: "remove",
    name: "Remove pages",
    description: "Keep the good parts. Delete unwanted pages from your PDF.",
    category: "Organize PDF",
    icon: "FileMinus2",
    color: "red",
  },
  {
    id: "extract",
    name: "Extract pages",
    description: "Take just what you need. Save selected pages as a new PDF.",
    category: "Organize PDF",
    icon: "Files",
    color: "red",
  },
];
