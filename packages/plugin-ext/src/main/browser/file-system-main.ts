/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { interfaces, injectable, inject } from 'inversify';
import Uri from 'vscode-uri';
import { Disposable, ResourceResolver, DisposableCollection } from '@theia/core';
import { Resource } from '@theia/core/lib/common/resource';
import URI from '@theia/core/lib/common/uri';
import { MAIN_RPC_CONTEXT, FileSystemMain, FileSystemExt } from '../../common/plugin-api-rpc';
import { RPCProtocol } from '../../common/rpc-protocol';
import { FileSystemError } from '../../plugin/types-impl';
import { UriComponents, Schemes } from '../../common/uri-components';
import { FileSystem } from '@theia/filesystem/lib/common';

export class FileSystemMainImpl implements FileSystemMain, Disposable {

    private readonly proxy: FileSystemExt;
    private readonly resourceResolver: FSResourceResolver;
    private readonly providers = new Map<number, Disposable>();
    private readonly toDispose = new DisposableCollection();

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.FILE_SYSTEM_EXT);
        this.resourceResolver = container.get(FSResourceResolver);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    async $registerFileSystemProvider(handle: number, scheme: string): Promise<void> {
        const toDispose = new DisposableCollection(
            this.resourceResolver.registerResourceProvider(handle, scheme, this.proxy),
            Disposable.create(() => this.providers.delete(handle))
        );
        this.providers.set(handle, toDispose);
        this.toDispose.push(toDispose);
    }

    $unregisterProvider(handle: number): void {
        const disposable = this.providers.get(handle);
        if (disposable) {
            disposable.dispose();
        }
    }

    async $readFile(uriComponents: UriComponents): Promise<string> {
        const uri = Uri.revive(uriComponents);
        const resource = this.resourceResolver.resolve(new URI(uri));
        return resource.readContents();
    }

    async $writeFile(uriComponents: UriComponents, content: string): Promise<void> {
        const uri = Uri.revive(uriComponents);
        const resource = this.resourceResolver.resolve(new URI(uri));
        if (!resource.saveContents) {
            throw new FileSystemError(`'No write operation available on the resource for URI ${uriComponents}`);
        }
        return resource.saveContents(content);
    }

}

@injectable()
export class FSResourceResolver implements ResourceResolver, Disposable {

    // resource providers by schemas
    private providers = new Map<string, FSResourceProvider>();
    private toDispose = new DisposableCollection();

    @inject(FileSystem)
    private fileSystem: FileSystem;

    resolve(uri: URI): Resource {
        if (uri.scheme === Schemes.FILE) {
            return new FileResource(this.fileSystem, uri);
        }
        const provider = this.providers.get(uri.scheme);
        if (provider) {
            return provider.get(uri);
        }
        throw new Error(`Unable to find a Resource Provider for scheme '${uri.scheme}'`);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    registerResourceProvider(handle: number, scheme: string, proxy: FileSystemExt): Disposable {
        if (this.providers.has(scheme)) {
            throw new Error(`Resource Provider for scheme '${scheme}' is already registered`);
        }

        const provider = new FSResourceProvider(handle, proxy);
        this.providers.set(scheme, provider);

        const disposable = Disposable.create(() => {
            provider.dispose();
            this.providers.delete(scheme);
        });
        this.toDispose.push(disposable);
        return disposable;
    }
}

class FSResourceProvider implements Disposable {

    private resourceCache = new Map<string, FSResource>();

    constructor(private handle: number, private proxy: FileSystemExt) { }

    get(uri: URI): Resource {
        let resource = this.resourceCache.get(uri.toString());
        if (!resource) {
            resource = new FSResource(this.handle, uri, this.proxy);
            this.resourceCache.set(uri.toString(), resource);
        }
        return resource;
    }

    dispose(): void {
        this.resourceCache.clear();
    }
}

/** Resource that delegates reading/saving a content to a plugin's FileSystemProvider. */
export class FSResource implements Resource {

    constructor(private handle: number, public uri: URI, private proxy: FileSystemExt) { }

    readContents(options?: { encoding?: string }): Promise<string> {
        return this.proxy.$readFile(this.handle, Uri.parse(this.uri.toString()), options);
    }

    saveContents(content: string, options?: { encoding?: string }): Promise<void> {
        return this.proxy.$writeFile(this.handle, Uri.parse(this.uri.toString()), content, options);
    }

    dispose(): void { }
}

/** Resource that delegates to theia FileSystem */
export class FileResource implements Resource {

    constructor(readonly fileSystem: FileSystem, readonly uri: URI) { }

    async readContents(options?: { encoding?: string }): Promise<string> {
        const file = await this.fileSystem.resolveContent(this.uri.toString(), options);
        return file.content;
    }

    async saveContents(content: string, options?: { encoding?: string }): Promise<void> {
        const uriStr = this.uri.toString();
        const exist = await this.fileSystem.exists(uriStr);
        let stat;
        if (exist) {
            stat = await this.fileSystem.getFileStat(uriStr);
        } else {
            stat = await this.fileSystem.createFile(uriStr);
        }
        await this.fileSystem.setContent(stat!, content, options);
    }

    dispose(): void { }
}
