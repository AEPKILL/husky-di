/**
 * @overview Builds the highlighted step data for the homepage dependency
 * injection scrollytelling tutorial.
 * @author AEPKILL
 * @created 2026-07-02 14:35:00
 */

import type { RawCode } from "codehike/code";
import { highlight } from "codehike/code";
import type { CodehikeScrollyDemoStep } from "@/types/codehike-scrolly-demo.type";

const HOMEPAGE_SCROLLY_TUTORIAL_THEME = "slack-dark";
const HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME = "homepage-tutorial.ts";

type HomepageScrollyTutorialDefinition = Readonly<{
	id: string;
	eyebrow: string;
	fileName: string;
	title: string;
	summary: string;
	details: readonly string[];
	codeblock: RawCode;
}>;

const HOMEPAGE_SCROLLY_TUTORIAL_DEFINITIONS: readonly HomepageScrollyTutorialDefinition[] =
	[
		{
			id: "hard-wired-branching",
			eyebrow: "Step 1",
			fileName: HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME,
			title: "Start with the code smell dependency injection is trying to fix",
			summary:
				"A feature can work and still be badly wired when one object both chooses and uses its collaborators.",
			details: [
				"The upload method knows about AWS, SFTP, and WebDAV at the same time.",
				"Optional config values leak storage-specific details into a caller that should not care about them.",
				"This is where DI begins: not with a container, but with the feeling that the object owns too many decisions.",
			],
			codeblock: {
				lang: "ts",
				meta: `title=${HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME}`,
				value: `type StorageProvider = "aws" | "sftp" | "webdav";

interface Attachment {
  id: string;
  localPath: string;
  destination: StorageProvider;
}

class AttachmentService {
  async upload(
    attachment: Attachment,
    awsKey?: string,
    sftpHost?: string,
    webDavUrl?: string,
  ) {
    if (attachment.destination === "sftp") {
      return this.uploadToSftp(attachment, sftpHost!);
    }

    if (attachment.destination === "webdav") {
      return this.uploadToWebDav(attachment, webDavUrl!);
    }

    return this.uploadToAws(attachment, awsKey!);
  }
}`,
			},
		},
		{
			id: "extract-capability",
			eyebrow: "Step 2",
			fileName: HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME,
			title: "Extract the behavior that changes and give it a clear name",
			summary:
				"Once the storage behavior becomes an interface, the business flow can stop depending on vendor-specific branches.",
			details: [
				"`AttachmentStorage` names the capability the workflow actually needs.",
				"Each implementation keeps only the config and logic it owns.",
				"DI gets much easier to understand after the varying behavior has a stable abstraction.",
			],
			codeblock: {
				lang: "ts",
				meta: `title=${HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME}`,
				value: `type StorageProvider = "aws" | "sftp" | "webdav";

interface Attachment {
  id: string;
  localPath: string;
  destination: StorageProvider;
}

interface AttachmentStorage {
  upload(attachment: Attachment): Promise<string>;
}

class AwsStorage implements AttachmentStorage {
  async upload(attachment: Attachment): Promise<string> {
    return attachment.id;
  }
}

class SftpStorage implements AttachmentStorage {
  async upload(attachment: Attachment): Promise<string> {
    return attachment.id;
  }
}

class WebDavStorage implements AttachmentStorage {
  async upload(attachment: Attachment): Promise<string> {
    return attachment.id;
  }
}`,
			},
		},
		{
			id: "inject-dependency",
			eyebrow: "Step 3",
			fileName: HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME,
			title: "Dependency injection simply means passing the dependency in",
			summary:
				"The object that performs the upload no longer constructs its own storage. Another part of the system chooses it first.",
			details: [
				"`new UploadRequest(storage)` is already dependency injection.",
				"The composition logic now sits in `handleUpload`, while `UploadRequest` only uses the dependency.",
				"This is the key mental split: one place chooses dependencies, another place consumes them.",
			],
			codeblock: {
				lang: "ts",
				meta: `title=${HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME}`,
				value: `type StorageProvider = "aws" | "sftp" | "webdav";

interface Attachment {
  id: string;
  localPath: string;
  destination: StorageProvider;
}

interface AttachmentStorage {
  upload(attachment: Attachment): Promise<string>;
}

class AwsStorage implements AttachmentStorage {
  async upload(attachment: Attachment): Promise<string> {
    return attachment.id;
  }
}

class SftpStorage implements AttachmentStorage {
  async upload(attachment: Attachment): Promise<string> {
    return attachment.id;
  }
}

class WebDavStorage implements AttachmentStorage {
  async upload(attachment: Attachment): Promise<string> {
    return attachment.id;
  }
}

class UploadRequest {
  constructor(
    private readonly storage: AttachmentStorage,
  ) {}

  async upload(attachment: Attachment): Promise<string> {
    return await this.storage.upload(attachment);
  }
}

async function handleUpload(
  attachment: Attachment,
) {
  const storage =
    attachment.destination === "sftp"
      ? new SftpStorage()
      : attachment.destination === "webdav"
        ? new WebDavStorage()
        : new AwsStorage();

  return await new UploadRequest(storage).upload(attachment);
}`,
			},
		},
		{
			id: "container-composition",
			eyebrow: "Step 4",
			fileName: HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME,
			title: "Husky DI gives that composition point a single explicit home",
			summary:
				"The library does not invent dependency injection. It makes the wiring rules named, visible, and deterministic.",
			details: [
				"`createServiceIdentifier()` gives the runtime graph explicit names.",
				"`register()` centralizes assembly instead of scattering `new` and branching logic through request handlers.",
				"`useClass` and class-field `resolve()` match the repository's preferred no-decorator core workflow.",
			],
			codeblock: {
				lang: "ts",
				meta: "title=homepage-tutorial.ts",
				value: `import {
  createContainer,
  createServiceIdentifier,
  resolve,
} from "@husky-di/core";

type StorageProvider = "aws" | "sftp" | "webdav";

interface Attachment {
  id: string;
  localPath: string;
  destination: StorageProvider;
}

interface AttachmentStorage {
  upload(attachment: Attachment): Promise<string>;
}

class AwsStorage implements AttachmentStorage {
  async upload(attachment: Attachment): Promise<string> {
    return attachment.id;
  }
}

class SftpStorage implements AttachmentStorage {
  async upload(attachment: Attachment): Promise<string> {
    return attachment.id;
  }
}

class WebDavStorage implements AttachmentStorage {
  async upload(attachment: Attachment): Promise<string> {
    return attachment.id;
  }
}

const IStorageProvider =
  createServiceIdentifier<StorageProvider>("IStorageProvider");
const IAttachmentStorage =
  createServiceIdentifier<AttachmentStorage>("IAttachmentStorage");
const IUploadRequest =
  createServiceIdentifier<UploadRequest>("IUploadRequest");

class UploadRequest {
  private readonly storage = resolve(IAttachmentStorage);

  async upload(attachment: Attachment): Promise<string> {
    return await this.storage.upload(attachment);
  }
}

const container = createContainer("HomepageTutorialContainer");

container.register(IStorageProvider, {
  useValue: "sftp",
});

container.register(IAttachmentStorage, {
  useFactory: () => {
    const provider = resolve(IStorageProvider);

    if (provider === "sftp") {
      return new SftpStorage();
    }

    if (provider === "webdav") {
      return new WebDavStorage();
    }

    return new AwsStorage();
  },
});

container.register(IUploadRequest, {
  useClass: UploadRequest,
});

const request = container.resolve(IUploadRequest);`,
			},
		},
		{
			id: "testing-seam",
			eyebrow: "Step 5",
			fileName: HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME,
			title: "The payoff is that tests become small and mechanical",
			summary:
				"Once the seam is explicit, you can replace one dependency with a fake instead of wrestling with private state or hidden setup.",
			details: [
				"`useValue` is enough to swap a fake implementation into the graph.",
				"The test stays focused on the workflow contract instead of storage vendor behavior.",
				"Husky DI keeps the same seam visible in production and in tests.",
			],
			codeblock: {
				lang: "ts",
				meta: `title=${HOMEPAGE_SCROLLY_TUTORIAL_FILE_NAME}`,
				value: `import {
  createContainer,
  createServiceIdentifier,
  resolve,
} from "@husky-di/core";

type StorageProvider = "aws" | "sftp" | "webdav";

interface Attachment {
  id: string;
  localPath: string;
  destination: StorageProvider;
}

interface AttachmentStorage {
  upload(attachment: Attachment): Promise<string>;
}

const IAttachmentStorage =
  createServiceIdentifier<AttachmentStorage>("IAttachmentStorage");
const IUploadRequest =
  createServiceIdentifier<UploadRequest>("IUploadRequest");

class UploadRequest {
  private readonly storage = resolve(IAttachmentStorage);

  async upload(attachment: Attachment): Promise<string> {
    return await this.storage.upload(attachment);
  }
}

class FakeStorage implements AttachmentStorage {
  public readonly uploaded: Attachment[] = [];

  async upload(attachment: Attachment): Promise<string> {
    this.uploaded.push(attachment);
    return attachment.id;
  }
}

const container = createContainer("HomepageTutorialTestContainer");

container.register(IAttachmentStorage, {
  useValue: new FakeStorage(),
});

container.register(IUploadRequest, {
  useClass: UploadRequest,
});

async function testUploadRequest() {
  const request = container.resolve(IUploadRequest);
  const storage = container.resolve(IAttachmentStorage);

  const attachment: Attachment = {
    id: "attachment-1",
    localPath: "/tmp/readme.txt",
    destination: "aws",
  };

  const uploadedId = await request.upload(attachment);

  console.log(uploadedId);
  console.log(storage.uploaded.length);
}`,
			},
		},
	];

export async function createHomepageScrollyTutorialSteps(): Promise<
	CodehikeScrollyDemoStep[]
> {
	const highlightedSteps = await Promise.all(
		HOMEPAGE_SCROLLY_TUTORIAL_DEFINITIONS.map(async (definition, index) => {
			const code = await highlight(
				definition.codeblock,
				HOMEPAGE_SCROLLY_TUTORIAL_THEME,
			);
			const previousDefinition =
				index > 0 ? HOMEPAGE_SCROLLY_TUTORIAL_DEFINITIONS[index - 1] : null;

			return {
				id: definition.id,
				eyebrow: definition.eyebrow,
				fileName: definition.fileName,
				focusLineIndex: getFirstChangedLineIndex(
					previousDefinition?.codeblock.value,
					definition.codeblock.value,
				),
				title: definition.title,
				summary: definition.summary,
				details: definition.details,
				code,
			} satisfies CodehikeScrollyDemoStep;
		}),
	);

	return highlightedSteps;
}

function getFirstChangedLineIndex(
	previousCode: string | undefined,
	nextCode: string,
): number {
	if (!previousCode) {
		return 0;
	}

	const previousLines = previousCode.split("\n");
	const nextLines = nextCode.split("\n");
	const shortestLength = Math.min(previousLines.length, nextLines.length);

	for (let lineIndex = 0; lineIndex < shortestLength; lineIndex += 1) {
		if (previousLines[lineIndex] !== nextLines[lineIndex]) {
			return lineIndex;
		}
	}

	return Math.max(0, Math.min(previousLines.length, nextLines.length - 1));
}
