import { File, Paths } from 'expo-file-system';
import { Asset } from 'expo-asset';
import { Asset as MediaAsset, requestPermissionsAsync } from 'expo-media-library';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import DocumentVisionModule from '../../modules/document-vision/src/DocumentVisionModule';
import type { ScanPage } from '../types';
import { createWatermarkedCopy } from './imagePipeline';

type ExportProgress = (current: number, total: number, label: string) => void;
const PDF_WATERMARK_ASSET = require('../../assets/brand/shougongchuan-logo.png');

let pdfWatermarkUriPromise: Promise<string> | undefined;

const requireReadyPages = (pages: ScanPage[]) => {
  const readyPages = pages.filter(
    (page): page is ScanPage & { processedUri: string } =>
      page.status === 'ready' && Boolean(page.processedUri),
  );
  if (!readyPages.length) {
    throw new Error('还没有可导出的扫描页');
  }
  return readyPages;
};

const cleanFilename = (filename: string) => {
  const cleaned = filename
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ');
  return cleaned || `扫描文件-${new Date().toISOString().slice(0, 10)}`;
};

async function exportReadyUri(uri: string, watermark: boolean) {
  return watermark ? createWatermarkedCopy(uri) : uri;
}

async function resolvePdfWatermarkUri() {
  if (!pdfWatermarkUriPromise) {
    pdfWatermarkUriPromise = (async () => {
      const asset = Asset.fromModule(PDF_WATERMARK_ASSET);
      const downloaded = await asset.downloadAsync();
      const localUri = downloaded.localUri ?? asset.localUri;
      if (!localUri) {
        throw new Error('PDF 水印资源尚未准备完成');
      }
      return localUri;
    })();
  }
  return pdfWatermarkUriPromise;
}

export async function savePagesAsImages(
  pages: ScanPage[],
  watermark: boolean,
  onProgress?: ExportProgress,
) {
  const readyPages = requireReadyPages(pages);
  const permission = await requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) {
    throw new Error('需要相册写入权限才能保存扫描图片');
  }

  const exportedUris: string[] = [];
  for (let index = 0; index < readyPages.length; index += 1) {
    onProgress?.(index + 1, readyPages.length, `正在保存第 ${index + 1} 页`);
    const uri = await exportReadyUri(
      readyPages[index].processedUri,
      watermark,
    );
    await MediaAsset.create(uri);
    exportedUris.push(uri);
  }
  return exportedUris;
}

export async function createPdf(
  pages: ScanPage[],
  filename: string,
  watermark: boolean,
  onProgress?: ExportProgress,
) {
  const readyPages = requireReadyPages(pages);
  const destination = new File(
    Paths.cache,
    `${cleanFilename(filename)}.pdf`,
  );

  if (DocumentVisionModule) {
    try {
      onProgress?.(
        readyPages.length,
        readyPages.length,
        `正在生成 ${readyPages.length} 页 PDF`,
      );
      const result = await DocumentVisionModule.createPdfAsync(
        readyPages.map((page) => page.processedUri),
        destination.uri,
        watermark ? await resolvePdfWatermarkUri() : null,
      );
      if (result.uri && result.numberOfPages === readyPages.length) {
        return result.uri;
      }
    } catch {
      // Expo Go 和旧 Development Build 继续使用 HTML 后备导出。
    }
  }

  const imageTags: string[] = [];

  for (let index = 0; index < readyPages.length; index += 1) {
    onProgress?.(
      index + 1,
      readyPages.length,
      `正在排版第 ${index + 1} 页`,
    );
    const uri = await exportReadyUri(
      readyPages[index].processedUri,
      watermark,
    );
    const encoded = await new File(uri).base64();
    imageTags.push(
      `<section class="page"><img alt="扫描第 ${index + 1} 页" src="data:image/jpeg;base64,${encoded}" /></section>`,
    );
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4 portrait; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #ffffff; }
      .page {
        width: 595px;
        height: 842px;
        margin: 0;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        page-break-after: always;
        break-after: page;
        background: #ffffff;
      }
      .page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
    </style>
  </head>
  <body>${imageTags.join('')}</body>
</html>`;

  onProgress?.(readyPages.length, readyPages.length, '正在生成 PDF');
  const printed = await Print.printToFileAsync({
    html,
    width: 595,
    height: 842,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  await new File(printed.uri).copy(destination, { overwrite: true });
  return destination.uri;
}

export async function sharePdf(uri: string) {
  const available = await Sharing.isAvailableAsync();
  if (!available) return false;
  await Sharing.shareAsync(uri, {
    UTI: 'com.adobe.pdf',
    mimeType: 'application/pdf',
    dialogTitle: '分享扫描 PDF',
  });
  return true;
}

export async function shareImage(uri: string) {
  const available = await Sharing.isAvailableAsync();
  if (!available) return false;
  await Sharing.shareAsync(uri, {
    UTI: 'public.jpeg',
    mimeType: 'image/jpeg',
    dialogTitle: '分享扫描图片',
  });
  return true;
}
