import React from "react";
import { Text } from "react-native";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";
import { Celebration, CountUp, ProgressBar, Shakeable, Touchable } from "@/components/motion";

beforeEach(() => jest.clearAllMocks());

describe("Touchable", () => {
    it("calls onPress, with a haptic only when asked for one", () => {
        const onPress = jest.fn();
        render(
            <>
                <Touchable onPress={onPress} accessibilityLabel="plain"><Text>Plain</Text></Touchable>
                <Touchable onPress={onPress} haptic="light" accessibilityLabel="button"><Text>Button</Text></Touchable>
            </>,
        );

        fireEvent.press(screen.getByLabelText("plain"));
        expect(onPress).toHaveBeenCalledTimes(1);
        expect(Haptics.impactAsync).not.toHaveBeenCalled();

        fireEvent.press(screen.getByLabelText("button"));
        expect(onPress).toHaveBeenCalledTimes(2);
        expect(Haptics.impactAsync).toHaveBeenCalledWith("light");
    });

    it("does nothing while disabled", () => {
        const onPress = jest.fn();
        render(<Touchable onPress={onPress} disabled haptic="light" accessibilityLabel="off"><Text>Off</Text></Touchable>);
        fireEvent.press(screen.getByLabelText("off"));
        expect(onPress).not.toHaveBeenCalled();
        expect(Haptics.impactAsync).not.toHaveBeenCalled();
    });

    it("is announced as a button", () => {
        render(<Touchable onPress={() => {}} accessibilityLabel="go"><Text>Go</Text></Touchable>);
        expect(screen.getByRole("button", { name: "go" })).toBeTruthy();
    });
});

describe("ProgressBar", () => {
    it.each([
        [0.42, 42],
        [-1, 0],
        [7, 100],
        [Number.NaN, 0],
    ])("reports %p as %i percent to assistive technology", (progress, now) => {
        render(<ProgressBar progress={progress} accessibilityLabel="Upload" />);
        expect(screen.getByLabelText("Upload").props.accessibilityValue).toEqual({ min: 0, max: 100, now });
    });
});

describe("CountUp", () => {
    it("ends on the exact value and always announces the final number", () => {
        jest.useFakeTimers();
        render(<CountUp value={128} durationMs={300} format={(n) => `${Math.round(n)} scans`} />);

        expect(screen.getByLabelText("128 scans")).toBeTruthy();
        act(() => { jest.advanceTimersByTime(1000); });
        expect(screen.getByText("128 scans")).toBeTruthy();
        jest.useRealTimers();
    });
});

describe("Shakeable", () => {
    it("buzzes once for each new error, not on first render without one", () => {
        const { rerender } = render(<Shakeable trigger={0}><Text>form</Text></Shakeable>);
        expect(Haptics.notificationAsync).not.toHaveBeenCalled();

        rerender(<Shakeable trigger={1}><Text>form</Text></Shakeable>);
        rerender(<Shakeable trigger={1}><Text>form</Text></Shakeable>);
        expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);

        rerender(<Shakeable trigger={2}><Text>form</Text></Shakeable>);
        expect(Haptics.notificationAsync).toHaveBeenCalledTimes(2);
    });
});

describe("Celebration", () => {
    it("renders nothing until visible", () => {
        render(<Celebration visible={false} title="Welcome to Pro" />);
        expect(screen.queryByText("Welcome to Pro")).toBeNull();
    });

    it("shows the message, plays a success haptic and finishes by itself", () => {
        jest.useFakeTimers();
        const onDone = jest.fn();
        render(<Celebration visible title="Welcome to Pro" message="Limits raised" onDone={onDone} durationMs={500} />);

        expect(screen.getByText("Welcome to Pro")).toBeTruthy();
        expect(screen.getByText("Limits raised")).toBeTruthy();
        expect(Haptics.notificationAsync).toHaveBeenCalledWith("success");

        expect(onDone).not.toHaveBeenCalled();
        act(() => { jest.advanceTimersByTime(600); });
        expect(onDone).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });

    it("can be tapped away early", () => {
        const onDone = jest.fn();
        render(<Celebration visible title="Saved" onDone={onDone} />);
        fireEvent.press(screen.getByLabelText("Saved. Tap to continue."));
        expect(onDone).toHaveBeenCalledTimes(1);
    });
});
