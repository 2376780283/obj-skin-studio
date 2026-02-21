// Part 1: UiHelper & PropertyEditor 增强
class UiHelper {
    static fileInput = null;

    static openFile(callback) {
        if (UiHelper.fileInput === null) {
            let el = document.createElement("input");
            el.type = "file";
            el.style.display = "none";
            document.body.appendChild(el);
            UiHelper.fileInput = el;
        }
        UiHelper.fileInput.onchange = (ev) => {
            if (ev.target.files.length !== 1) return;
            callback(ev.target.files[0]);
        };
        UiHelper.fileInput.click();
    }

    static loadImage(url, cb) {
        let image = new Image();
        image.onload = () => cb(image);
        image.src = url;
    }

    static saveBlob(blob, name) {
        let url = URL.createObjectURL(blob);
        let link = document.createElement("a");
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 20000);
    }

    static generateUUID = (typeof(window.crypto) != 'undefined' && typeof(window.crypto.getRandomValues) != 'undefined')
        ? () => {
            let buf = new Uint16Array(8);
            window.crypto.getRandomValues(buf);
            let pad4 = (num) => num.toString(16).padStart(4, '0');
            return `${pad4(buf[0])}${pad4(buf[1])}-${pad4(buf[2])}-${pad4(buf[3])}-${pad4(buf[4])}-${pad4(buf[5])}${pad4(buf[6])}${pad4(buf[7])}`;
        }
        : () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            let r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
            return v.toString(16);
        });

    static linePlaneIntersection(planePoint, planeNormal, linePoint, lineDirection) {
        if (vec3.dot(planeNormal, lineDirection) === 0) return null;
        let t = (vec3.dot(planeNormal, planePoint) - vec3.dot(planeNormal, linePoint)) / vec3.dot(planeNormal, lineDirection);
        let ret = vec3.create();
        vec3.scale(ret, lineDirection, t);
        vec3.add(ret, linePoint, ret);
        return ret;
    }
}

class PropertyEditor {
    constructor() {
        this.container = document.getElementById("inspector");
    }

    clear() {
        let defaultActions = document.getElementById("inspectDefaultActions");
        while (this.container.firstChild) this.container.removeChild(this.container.lastChild);
        this.container.appendChild(defaultActions);
    }

    addVecF(name, initialValue, cb) {
        let li = document.createElement("li");
        li.classList.add("prop-row");
        let nameDom = document.createElement("span");
        nameDom.textContent = name;
        li.appendChild(nameDom);
        
        let container = document.createElement("div");
        container.style.display = "flex";
        container.style.gap = "4px";
        
        let value = [...initialValue];
        let tbs = [];
        for (let i = 0; i < initialValue.length; i++) {
            let tb = document.createElement("input");
            tb.type = "number"; // 现代输入框
            tb.step = "0.1";
            tb.style.width = "50px";
            tb.value = value[i];
            tb.addEventListener("change", () => {
                value[i] = parseFloat(tb.value);
                cb([...value]);
            });
            container.appendChild(tb);
            tbs.push(tb);
        }
        li.appendChild(container);
        this.container.appendChild(li);
        return (v) => {
            for (let i = 0; i < tbs.length; i++) {
                value[i] = v[i];
                tbs[i].value = v[i];
            }
        };
    }

    addDropDown(name, values, displayValues, defaultValue, cb) {
        let li = document.createElement("li");
        let nameDom = document.createElement("span");
        nameDom.textContent = name;
        li.appendChild(nameDom);
        let selectDom = document.createElement("select");
        selectDom.style.flex = "1";
        for (let i = 0; i < values.length; i++) {
            let el = document.createElement("option");
            el.textContent = displayValues[i];
            el.value = values[i];
            selectDom.appendChild(el);
        }
        selectDom.value = defaultValue;
        selectDom.addEventListener("change", () => cb(selectDom.value));
        li.appendChild(selectDom);
        this.container.appendChild(li);
    }
}

// Part 2: Canvas & Mover 保持原有计算逻辑
class PrimaryCanvas {
    constructor() {
        this.canvas = document.getElementById("primaryCanvas");
        this.context = this.canvas.getContext("webgl");
        this.renderer = new Renderer(this.canvas, this.context);
        this.renderer.bgColor = [0.06, 0.09, 0.16, 1]; // 匹配 --bg-darker
        this.renderer.draw();
        this.canvas.addEventListener("mousemove", (ev) => {
            if (ev.buttons & 1) this.rotateByMouseDelta(ev.movementX, ev.movementY);
        });
        window.addEventListener('resize', () => this.draw(), false);
        this.drawCallbacks = [];
    }

    setModel(model) { this.renderer.setModel(model); this.draw(); }
    setTexture(image) { this.renderer.setTexture(image); this.draw(); }
    setSelectedGroup(group) {
        if (group !== null) {
            this.renderer.highlightedVertexStart = group.vertexStart;
            this.renderer.highlightedVertexEnd = group.vertexEnd;
        } else {
            this.renderer.highlightedVertexStart = -1;
            this.renderer.highlightedVertexEnd = -1;
        }
        this.draw();
    }
    rotateByMouseDelta(dx, dy) {
        this.renderer.rotationX += dx * 0.01;
        this.renderer.rotationY += dy * 0.01;
        this.draw();
    }
    draw() {
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.renderer.draw();
        for (let cb of this.drawCallbacks) cb();
    }
}

class Point3DMover {
    constructor(primaryCanvas) {
        this.container = document.getElementById("point3DMover");
        this.axisX = document.getElementById("point3DMoverX");
        this.axisY = document.getElementById("point3DMoverY");
        this.axisZ = document.getElementById("point3DMoverZ");
        this.primaryCanvas = primaryCanvas;
        this.relativeTo = this.primaryCanvas.canvas;
        this.point = null;
        this.callback = null;
        this.primaryCanvas.drawCallbacks.push(() => this.setPoint(this.point, this.callback));
        this.setupAxis(this.axisX, 0);
        this.setupAxis(this.axisY, 1);
        this.setupAxis(this.axisZ, 2);
    }

    setupAxis(dom, axisNo) {
        let findWorldPosition = (x, y) => {
            let sp = this.primaryCanvas.renderer.sceneToScreen(this.point);
            let spb1 = this.primaryCanvas.renderer.screenToScene([sp[0], sp[1], -1]);
            let spb2 = this.primaryCanvas.renderer.screenToScene([sp[0], sp[1], 1]);
            vec4.sub(spb2, spb2, spb1); vec4.normalize(spb2, spb2);
            let p1 = this.primaryCanvas.renderer.screenToScene([x, y, -1]);
            let p2 = this.primaryCanvas.renderer.screenToScene([x, y, 1]);
            vec4.sub(p2, p2, p1); vec4.normalize(p2, p2);
            return UiHelper.linePlaneIntersection(this.point, spb2, p1, p2);
        };
        let offset = [0, 0, 0];
        let capturedPointerId = -1;
        dom.addEventListener("pointerdown", (ev) => {
            capturedPointerId = ev.pointerId;
            dom.setPointerCapture(ev.pointerId);
            let x = ev.pageX - this.relativeTo.offsetLeft;
            let y = ev.pageY - this.relativeTo.offsetTop;
            offset = findWorldPosition(x, y);
            vec3.sub(offset, offset, this.point);
        });
        dom.addEventListener("pointermove", (ev) => {
            if (this.callback !== null && ev.pointerId === capturedPointerId) {
                let x = ev.pageX - this.relativeTo.offsetLeft;
                let y = ev.pageY - this.relativeTo.offsetTop;
                let p = findWorldPosition(x, y);
                vec3.sub(p, p, offset);
                this.point[axisNo] = p[axisNo];
                this.callback(this.point);
                this.setPoint(this.point, this.callback);
            }
        });
        dom.addEventListener("pointerup", (ev) => {
            capturedPointerId = -1;
            dom.releasePointerCapture(ev.pointerId);
        });
    }

    setAxis(dom, sp, spDir, depth) {
        let diff = vec2.create();
        vec2.sub(diff, spDir, sp);
        let angle = Math.atan2(diff[1], diff[0]);
        dom.style.transform = "rotate(" + (angle / Math.PI * 180) + "deg)";
        dom.style.width = vec2.length(diff) + "px";
        dom.style.zIndex = depth + 100;
    }

    setPoint(p, cb) {
        this.point = p;
        this.callback = cb;
        if (p === null) { this.container.style.display = "none"; return; }
        this.container.style.display = "block";
        let sp = this.primaryCanvas.renderer.sceneToScreen(p);
        let spX = this.primaryCanvas.renderer.sceneToScreen([p[0] + 3, p[1], p[2]]);
        let spY = this.primaryCanvas.renderer.sceneToScreen([p[0], p[1] + 3, p[2]]);
        let spZ = this.primaryCanvas.renderer.sceneToScreen([p[0], p[1], p[2] + 3]);
        let depthTmp = [[spX[2], 0], [spY[2], 1], [spZ[2], 2]];
        depthTmp.sort();
        let depth = [0, 1, 2];
        for (let i = 0; i < 3; i++) depth[depthTmp[i][1]] = 2 - i;
        this.setAxis(this.axisX, sp, spX, depth[0]);
        this.setAxis(this.axisY, sp, spY, depth[1]);
        this.setAxis(this.axisZ, sp, spZ, depth[2]);
        sp[0] += this.relativeTo.offsetLeft;
        sp[1] += this.relativeTo.offsetTop;
        this.container.style.left = sp[0] + "px";
        this.container.style.top = sp[1] + "px";
    }
}

// Part 3: GroupList, Skin & SkinListUi
class GroupList {
    static TYPE_BONE = "bone";
    static TYPE_GROUP = "group";

    constructor(selectCallback) {
        this.container = document.getElementById("groupTree");
        this.selectCallback = selectCallback;
        this.selectionType = null;
        this.selection = null;
        this.selectionMap = { [GroupList.TYPE_BONE]: new Map(), [GroupList.TYPE_GROUP]: new Map() };
        this.selectedElement = null;
    }

    setObjects(objects, bones) {
        while (this.container.firstChild) this.container.removeChild(this.container.lastChild);
        this.selectedElement = null;
        this.selectionMap[GroupList.TYPE_BONE].clear();
        this.selectionMap[GroupList.TYPE_GROUP].clear();

        for (let bone of bones) {
            let rel = this.createElementDOM(GroupList.TYPE_BONE, bone, "🦴 " + bone.name);
            this.selectionMap[GroupList.TYPE_BONE].set(bone, rel);
            this.container.appendChild(rel);
            for (let groupIdx of bone.groups) {
                let group = objects[groupIdx[0]].groups[groupIdx[1]];
                let el = this.createElementDOM(GroupList.TYPE_GROUP, group, "  └ 📦 " + group.displayName);
                this.selectionMap[GroupList.TYPE_GROUP].set(group, el);
                el.style.paddingLeft = "24px";
                el.style.color = "var(--text-dim)";
                this.container.appendChild(el);
            }
        }
        this.setSelection(this.selectionType, this.selection);
    }

    setSelection(type, object) {
        if (this.selectedElement !== null) this.selectedElement.classList.remove("selected");
        this.selectionType = type;
        this.selection = object;
        this.selectedElement = type !== null ? this.selectionMap[type].get(object) : null;
        if (this.selectedElement) this.selectedElement.classList.add("selected");
        this.selectCallback(type, object);
    }

    createElementDOM(type, object, name) {
        let e = document.createElement("li");
        e.textContent = name;
        e.addEventListener("click", () => {
            if (this.selectedElement !== e) this.setSelection(type, object);
            else this.setSelection(null, null);
        });
        return e;
    }
}

class Skin {
    constructor(index) {
        this.index = index;
        this.image = null;
        this.imageUrl = null;
        this.model = null;
        this.modelStr = null;
        this.bones = [];
        this.updateCb = new Set();
        this.savePropertiesRequested = false;
    }

    loadFromLS() {
        this.setImage(localStorage.getItem("skin." + this.index + ".image"));
        this.modelStr = localStorage.getItem("skin." + this.index + ".model");
        this.model = this.modelStr ? ObjModel.parse(this.modelStr) : null;
        this.bones = JSON.parse(localStorage.getItem("skin." + this.index + ".bones"));
        if (this.bones === null) this.resetBones();
        if (this.model) this.assignBoneInfoToGroups();
        this.onUpdated();
    }

    setImage(url) {
        this.imageUrl = url;
        if (!url) { this.image = null; return; }
        UiHelper.loadImage(url, (img) => {
            if (this.imageUrl !== url) return;
            this.image = img;
            this.onUpdated();
        });
    }

    setModel(model) {
        this.modelStr = model;
        this.model = ObjModel.parse(model);
        this.resetBones();
        this.assignBoneInfoToGroups();
    }

    resetBones() {
        this.bones = SharedData.createDefaultBones();
        for (let b of this.bones) b.groups = [];
        if (this.model !== null) {
            let mainBone = this.bones[1];
            for (let i = 0; i < this.model.objects.length; i++) {
                let object = this.model.objects[i];
                for (let j = 0; j < object.groups.length; j++) mainBone.groups.push([i, j]);
            }
        }
    }

    assignBoneInfoToGroups() {
        for (let i = 0; i < this.model.objects.length; i++) {
            let o = this.model.objects[i];
            o.index = i;
            for (let j = 0; j < o.groups.length; j++) {
                o.groups[j].object = o;
                o.groups[j].index = j;
            }
        }
        for (let b of this.bones) {
            for (let gRef of b.groups) {
                let group = this.model.objects[gRef[0]].groups[gRef[1]];
                group.bone = b;
                group.indexTab = gRef;
            }
        }
    }

    deleteFromLS() {
        localStorage.removeItem("skin." + this.index + ".image");
        localStorage.removeItem("skin." + this.index + ".model");
        localStorage.removeItem("skin." + this.index + ".bones");
    }

    saveImageToLS() { if (this.imageUrl) localStorage.setItem("skin." + this.index + ".image", this.imageUrl); }
    saveModelToLS() { if (this.modelStr) localStorage.setItem("skin." + this.index + ".model", this.modelStr); }
    saveBonesToLS() { localStorage.setItem("skin." + this.index + ".bones", JSON.stringify(this.bones)); }

    postSaveProperties() {
        if (this.savePropertiesRequested) return;
        this.savePropertiesRequested = true;
        setTimeout(() => {
            this.saveBonesToLS();
            this.savePropertiesRequested = false;
        }, 1000);
    }

    exportGeometry() {
        if (this.image === null || this.model === null) return null;
        let bones = [];
        for (let b of this.bones) {
            let bCopy = Object.assign({}, b);
            delete bCopy["groups"];
            let indices = [];
            for (let gidx of b.groups) {
                let g = this.model.objects[gidx[0]].groups[gidx[1]];
                this.model.getMinecraftIndices(indices, g.start, g.end);
            }
            let mesh = this.model.exportPolyMesh(indices);
            if (mesh !== null) bCopy["poly_mesh"] = mesh;
            if (bCopy.hasOwnProperty("pivot")) bCopy["pivot"] = [-b.pivot[0], b.pivot[1], b.pivot[2]];
            bones.push(bCopy);
        }
        return { "bones": bones, "texturewidth": this.image.width, "textureheight": this.image.height };
    }

    onUpdated() { for (let cb of this.updateCb) cb(this); }
}

class SkinListUi {
    constructor(activeCallback) {
        this.skinList = [];
        this.skinDomList = [];
        this.selectedSkinDom = null;
        this.container = document.getElementById("skins");
        this.renderCanvas = document.createElement("canvas");
        this.renderCanvas.width = 64;
        this.renderCanvas.height = 64;
        this.renderContext = this.renderCanvas.getContext("webgl", {preserveDrawingBuffer: true});
        this.renderer = new Renderer(this.renderCanvas, this.renderContext);
        this.renderer.bgColor = [0, 0, 0, 0];
        this.skinUpdateCb = (skin) => this.redrawSkin(skin);
        this.activeCallback = activeCallback;
    }

    setSkinList(skinList) {
        let exportBtn = document.getElementById("export");
        let addSkinBtn = document.getElementById("addSkin");
        while (this.container.firstChild) this.container.removeChild(this.container.lastChild);
        for (let skin of this.skinList) skin.updateCb.delete(this.skinUpdateCb);
        this.skinList = skinList;
        this.skinDomList = [];
        for (let skin of skinList) {
            let dom = this.createEntryDOM(skin);
            this.skinDomList.push(dom);
            this.container.appendChild(dom);
            skin.updateCb.add(this.skinUpdateCb);
            this.redrawSkin(skin);
        }
        this.container.appendChild(addSkinBtn);
        this.container.appendChild(exportBtn);
    }

    redrawSkin(skin) {
        if (!this.skinList[skin.index]) return;
        this.renderer.setModel(skin.model);
        this.renderer.setTexture(skin.image);
        this.renderer.draw();
        this.skinDomList[skin.index].img.src = this.renderCanvas.toDataURL();
    }

    setSelected(skin) {
        if (this.selectedSkinDom) this.selectedSkinDom.classList.remove("selected");
        this.selectedSkinDom = (skin && this.skinDomList[skin.index]) ? this.skinDomList[skin.index] : null;
        if (this.selectedSkinDom) this.selectedSkinDom.classList.add("selected");
    }

    createEntryDOM(skin) {
        let el = document.createElement("li");
        el.classList.add("skin");
        el.img = document.createElement("img");
        el.appendChild(el.img);
        el.addEventListener("click", () => this.activeCallback(skin));
        return el;
    }
}

// Part 4: PropertyManager & UiManager (主控逻辑)
class PropertyManager {
    constructor(editor, pointMover) {
        this.editor = editor;
        this.skin = null;
        this.selectionType = null;
        this.selection = null;
        this.boneChangeCallback = null;
        this.pointMover = pointMover;
    }

    setSkin(skin) { this.skin = skin; }
    setSelection(type, what) { this.selectionType = type; this.selection = what; }

    update() {
        this.editor.clear();
        if (this.selectionType === GroupList.TYPE_BONE) this.createBoneProperties(this.selection);
        else if (this.selectionType === GroupList.TYPE_GROUP) {
            this.createBoneProperties(this.selection.bone);
            this.createGroupProperties(this.selection);
        }
    }

    createBoneProperties(bone) {
        let updateVecF = this.editor.addVecF("Pivot Point", bone.pivot, (val) => {
            bone.pivot = val;
            this.pointMover.setPoint(bone.pivot, (p) => {
                bone.pivot = p;
                updateVecF(p);
                this.skin.postSaveProperties();
            });
            this.skin.postSaveProperties();
        });
        this.pointMover.setPoint(bone.pivot, (p) => {
            bone.pivot = p;
            updateVecF(p);
            this.skin.postSaveProperties();
        });
    }

    createGroupProperties(group) {
        let boneNames = this.skin.bones.map(b => b.name);
        this.editor.addDropDown("Target Bone", boneNames, boneNames, group.bone.name, (newBoneName) => {
            let newBone = this.skin.bones.find(b => b.name === newBoneName);
            let iof = group.bone.groups.indexOf(group.indexTab);
            if (!newBone || iof === -1 || newBone === group.bone) return;
            group.bone.groups.splice(iof, 1);
            group.bone = newBone;
            newBone.groups.push(group.indexTab);
            this.boneChangeCallback();
        });
    }
}

class UiManager {
    constructor() {
        this.skins = [];
        this.activeSkin = null;
        this.primaryCanvas = new PrimaryCanvas();
        this.skinListUi = new SkinListUi((skin) => this.setSkin(skin));
        this.propEditor = new PropertyEditor();
        this.pointMover = new Point3DMover(this.primaryCanvas);
        this.propManager = new PropertyManager(this.propEditor, this.pointMover);
        this.groupList = new GroupList((type, g) => {
            this.primaryCanvas.setSelectedGroup(type === GroupList.TYPE_GROUP ? g : null);
            this.propManager.setSelection(type, g);
            this.propManager.update();
        });
        this.propManager.boneChangeCallback = () => {
            this.groupList.setObjects(this.activeSkin.model.objects, this.activeSkin.bones);
            this.activeSkin.saveBonesToLS();
        };

        UiHelper.loadImage("steve.png", (img) => {
            this.defaultImage = img;
            if (this.activeSkin && !this.activeSkin.image) this.setSkin(this.activeSkin);
        });

        this.initEventListeners();
        this.loadCurrentSkins((skins) => this.setSkins(skins));
    }

    initEventListeners() {
        document.getElementById("uploadModel").onclick = () => {
            UiHelper.openFile((file) => {
                let reader = new FileReader();
                reader.onloadend = () => {
                    if (this.activeSkin) {
                        this.activeSkin.setModel(reader.result);
                        this.activeSkin.saveModelToLS();
                        this.activeSkin.onUpdated();
                    }
                };
                reader.readAsText(file);
            });
        };
        document.getElementById("uploadTexture").onclick = () => {
            UiHelper.openFile((file) => {
                let reader = new FileReader();
                reader.onloadend = () => {
                    if (this.activeSkin) {
                        this.activeSkin.setImage(reader.result);
                        this.activeSkin.saveImageToLS();
                    }
                };
                reader.readAsDataURL(file);
            });
        };
        document.getElementById("addSkin").onclick = () => this.setSkin(this.addSkin());
        document.getElementById("deleteSkin").onclick = () => this.deleteSkin(this.activeSkin);
        document.getElementById("export").onclick = () => this.export();
    }

    setSkin(skin) {
        this.activeSkin = skin;
        this.primaryCanvas.setTexture(skin.image || this.defaultImage);
        this.primaryCanvas.setModel(skin.model);
        if (skin.model) this.groupList.setObjects(skin.model.objects, skin.bones);
        this.skinListUi.setSelected(skin);
        this.propManager.setSkin(skin);
        this.propManager.update();
    }

    createSkin(index) {
        let skin = new Skin(index);
        skin.updateCb.add(() => { if (skin === this.activeSkin) this.setSkin(this.activeSkin); });
        return skin;
    }

    deleteSkin(skin) {
        if (!skin) return;
        skin.deleteFromLS();
        this.skins.splice(skin.index, 1);
        this.skins.forEach((s, i) => {
            s.deleteFromLS();
            s.index = i;
            s.saveImageToLS(); s.saveModelToLS(); s.saveBonesToLS();
        });
        localStorage.setItem("skin.count", this.skins.length);
        this.setSkins(this.skins);
    }

    addSkin() {
        let skin = this.createSkin(this.skins.length);
        this.skins.push(skin);
        localStorage.setItem("skin.count", this.skins.length);
        this.skinListUi.setSkinList(this.skins);
        return skin;
    }

    setSkins(skins) {
        this.skins = skins;
        if (this.skins.length === 0) this.setSkin(this.addSkin());
        else {
            this.skinListUi.setSkinList(this.skins);
            this.setSkin(this.skins[0]);
        }
    }

    loadCurrentSkins(callback) {
        let count = localStorage.getItem("skin.count") || 0;
        let skins = [];
        for (let i = 0; i < count; i++) {
            let s = this.createSkin(i);
            s.loadFromLS();
            skins.push(s);
        }
        callback(skins);
    }

    export() {
        zip.createWriter(new zip.BlobWriter("application/zip"), (writer) => {
            let manifest = {
                "format_version": 2,
                "header": { "name": "Custom Pack", "uuid": UiHelper.generateUUID(), "version": [1, 0, 0] },
                "modules": [{ "type": "skin_pack", "uuid": UiHelper.generateUUID(), "version": [1, 0, 0] }]
            };
            let skinList = {
                "skins": this.skins.map(s => ({
                    "localization_name": "Skin #" + s.index,
                    "geometry": "geometry.n" + s.index,
                    "texture": "skin_" + s.index + ".png",
                    "type": "free"
                })),
                "serialize_name": "Custom", "localization_name": "Custom"
            };
            let geometry = { "format_version": "1.8.0" };
            this.skins.forEach(s => {
                let geo = s.exportGeometry();
                if (geo) geometry["geometry.n" + s.index] = geo;
            });

            const files = [
                ["manifest.json", JSON.stringify(manifest)],
                ["skins.json", JSON.stringify(skinList)],
                ["geometry.json", JSON.stringify(geometry)]
            ];

            let writeF = (i) => {
                if (i < files.length) writer.add(files[i][0], new zip.TextReader(files[i][1]), () => writeF(i+1));
                else writeS(0);
            };
            let writeS = (i) => {
                if (i < this.skins.length) writer.add(`skin_${this.skins[i].index}.png`, new zip.Data64URIReader(this.skins[i].imageUrl), () => writeS(i+1));
                else writer.close(b => UiHelper.saveBlob(b, "skinpack.zip"));
            };
            writeF(0);
        }, e => alert(e));
    }
}
