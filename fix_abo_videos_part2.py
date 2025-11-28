file_path = "C:/Users/Roberto/Desktop/Quick/LaunchPro/launchpro-app/launchpro-app/services/campaign-orchestrator.service.ts"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the section after useMultipleAds for images and before the else block
old_section = '''      logger.success('meta', `All ${createdAds.length} ads created successfully (ABO mode)`);

    } else {
      // SINGLE IMAGE AD - Standard single image ad'''

new_section = '''      logger.success('meta', `All ${createdAds.length} ads created successfully (ABO mode)`);

    } else if (useMultipleAds && hasMultipleVideos) {
      // ABO MULTIPLE VIDEO ADS - One ad per video with its thumbnail
      logger.info('meta', `Creating ${videos.length} individual Video Ads (ABO mode)`);

      const axios = require('axios');

      for (let idx = 0; idx < videos.length; idx++) {
        const video = videos[idx];

        // Upload video
        logger.info('meta', `Uploading video ${idx + 1}/${videos.length}: ${video.fileName}`);
        const videoResponse = await axios.get(video.url, { responseType: 'arraybuffer' });
        const videoBuffer = Buffer.from(videoResponse.data);
        const uploadedVideoId = await metaService.uploadVideo(videoBuffer, video.fileName, adAccountId, accessToken);

        await prisma.media.update({
          where: { id: video.id },
          data: { usedInMeta: true },
        });

        // Get linked thumbnail or fallback to image at same index
        let thumbnailImage: any;
        if (video.thumbnailMediaId) {
          thumbnailImage = await prisma.media.findUnique({
            where: { id: video.thumbnailMediaId },
          });
          logger.info('meta', `Using linked thumbnail for video ${idx + 1}: ${thumbnailImage?.fileName}`);
        }
        if (!thumbnailImage && images.length > 0) {
          thumbnailImage = images[idx] || images[0];
          logger.info('meta', `Using fallback thumbnail for video ${idx + 1}: ${thumbnailImage?.fileName}`);
        }

        if (!thumbnailImage) {
          throw new Error(`No thumbnail available for video ${video.fileName}. Please upload a thumbnail image.`);
        }

        // Upload thumbnail
        const thumbResponse = await axios.get(thumbnailImage.url, { responseType: 'arraybuffer' });
        const thumbBuffer = Buffer.from(thumbResponse.data);
        const thumbHash = await metaService.uploadImage(thumbBuffer, thumbnailImage.fileName, adAccountId, accessToken);

        await prisma.media.update({
          where: { id: thumbnailImage.id },
          data: { usedInMeta: true, metaHash: thumbHash },
        });

        // Create creative
        const videoCreative = await metaService.createAdCreative({
          name: `${campaign.name} - Video Creative ${idx + 1}`,
          object_story_spec: {
            page_id: metaAccount.metaPageId,
            video_data: {
              video_id: uploadedVideoId,
              image_hash: thumbHash,
              title: adCopy.headline,
              message: adCopy.primaryText,
              call_to_action: {
                type: 'LEARN_MORE',
                value: { link: finalLink },
              },
            },
          },
        }, adAccountId, accessToken);

        // Create ad
        const videoAd = await metaService.createAd({
          name: `${getTomorrowDate()}_${idx + 1}`,
          adset_id: adSet.id,
          creative: { creative_id: videoCreative.id },
          status: 'PAUSED',
        }, adAccountId, accessToken);

        createdAds.push({ adId: videoAd.id, creativeId: videoCreative.id });
        logger.success('meta', `Video Ad ${idx + 1}/${videos.length} created`, {
          adId: videoAd.id,
          videoId: uploadedVideoId,
          thumbnailHash: thumbHash,
        });
      }

      // Use the last created ad/creative for return value
      creative = { id: createdAds[createdAds.length - 1].creativeId };
      ad = { id: createdAds[createdAds.length - 1].adId };

      logger.success('meta', `All ${createdAds.length} video ads created successfully (ABO mode)`);

    } else {
      // SINGLE IMAGE AD - Standard single image ad'''

if old_section in content:
    content = content.replace(old_section, new_section)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("SUCCESS: ABO multiple videos branch added")
else:
    print("ERROR: Could not find insertion point")
