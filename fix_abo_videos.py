file_path = "C:/Users/Roberto/Desktop/Quick/LaunchPro/launchpro-app/launchpro-app/services/campaign-orchestrator.service.ts"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix the detection logic
old_detection = '''    // Determine if we need Carousel (CBO + multiple images) or Multiple Ads (ABO)
    const hasMultipleImages = !useVideo && typeof uploadedImageHashes !== 'undefined' && uploadedImageHashes.length > 1;
    const useCarousel = isCBO && hasMultipleImages;
    const useMultipleAds = !isCBO && hasMultipleImages;

    logger.info('meta', `Ad creation strategy:`, {
      useVideo,
      hasMultipleImages,
      imageCount: typeof uploadedImageHashes !== 'undefined' ? uploadedImageHashes.length : 1,
      isCBO,
      useCarousel,
      useMultipleAds,
    });'''

new_detection = '''    // Determine if we need Carousel (CBO + multiple images) or Multiple Ads (ABO)
    const hasMultipleImages = !useVideo && typeof uploadedImageHashes !== 'undefined' && uploadedImageHashes.length > 1;
    const hasMultipleVideos = useVideo && videos.length > 1;
    const useCarousel = isCBO && hasMultipleImages;
    const useMultipleAds = !isCBO && (hasMultipleImages || hasMultipleVideos);

    logger.info('meta', `Ad creation strategy:`, {
      useVideo,
      hasMultipleImages,
      hasMultipleVideos,
      imageCount: typeof uploadedImageHashes !== 'undefined' ? uploadedImageHashes.length : 1,
      videoCount: videos.length,
      isCBO,
      useCarousel,
      useMultipleAds,
    });'''

if old_detection in content:
    content = content.replace(old_detection, new_detection)
    print("SUCCESS: Detection logic updated")
else:
    print("ERROR: Could not find detection logic")

# 2. Fix the single video branch condition
old_single_video = '''    if (useVideo) {
      // VIDEO AD - Single video with thumbnail
      creative = await metaService.createAdCreative({
        name: `${campaign.name} - Video Creative`,'''

new_single_video = '''    if (useVideo && !hasMultipleVideos) {
      // VIDEO AD - Single video with thumbnail
      creative = await metaService.createAdCreative({
        name: `${campaign.name} - Video Creative`,'''

if old_single_video in content:
    content = content.replace(old_single_video, new_single_video)
    print("SUCCESS: Single video branch condition updated")
else:
    print("ERROR: Could not find single video branch")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("DONE: First two changes applied")
